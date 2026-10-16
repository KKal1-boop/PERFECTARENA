// WHAT EACH PROVINCE IS — its ground, its buildings, its weather and its people (**block B18**).
//
// `game/worldMap.js` gives every place the climate of its own pixel in `TERRAIN.IMG`, and that is
// the game's own answer (D-38 — the six terrain classes read off `OpenTESArena`'s constants). It is
// a *ground* answer, and this file exists because the owner asked for the province to be more than
// its pixel, in the later games' own terms:
//
//   * *"elsweyr and summerset isle should be temperate but with trees"* — and their **buildings**
//     *"textures of desert"*;
//   * *"morrowind should be mostly desert but with mountain architecture"*;
//   * *"skyrim needs to be a mix of normal mountain and temperate but in some cities like winterhold
//     it never needs to stop snowing"*;
//   * *"sentinel should be desert"*;
//   * and *"in morrowind mostly dark elf npcs in skyrim mostly nords … all provinces should have a
//     mix of people but mostly their people"*.
//
// So a place has **two climates, not one**, and this module is the law of both plus two small
// properties that go with them:
//
//   * **`ground`** — the country, the road, the creatures and the sky. It defaults to the pixel's
//     own class (D-38), which is why the eight default rows are `null`.
//   * **`architecture`** — what the settlement's `.INF` is built from (`TC*`, `MC*`, `DC*`), which is
//     what the player sees as *architecture*. It too defaults to the pixel's class.
//   * **`weather`** — a place whose sky does not stop doing one thing, which is one city in the
//     released world and is named below.
//   * **`people`** — a weighted pool of the sibling install's **race name banks**
//     (`game/names.js`, eight of them, read out of `NAMEGEN.DAT`), dominant race first. The names a
//     province's folk carry become that province's folk, which is the half of the owner's report a
//     name can answer; the *sheets* a person is drawn from remain the archive's own art, and the
//     Argonian/Khajiit art Arena's install does not carry is the next block's job (queue item 0f).
//
// **PROVENANCE.** Arena has no such table — its own file leaves the Imperial Province empty (D-39)
// and its executable holds province *names*, not province *characters*. The readings here are the
// **later games' Tamriel** (`Oblivion`/`Skyrim`-era geography: Elsweyr's savannahs and its Khajiit,
// Morrowind's ash and its Dunmer, Skyrim's holds and its Nords, the Alik'r around Sentinel,
// Summerset's high elves and Valenwood's Bosmer), which is this project's standing rule for lore
// Arena does not give: *take the later reading*. The **line** across Skyrim is this project's own
// (a province rectangle is not a hold map), and `docs/DEFECTS.md` D-41 says so.
//
// Where the owner's own words and the later games' geography disagree, the owner's words win and the
// row says it: **Summerset Isle's buildings are desert-textured here** because *"elsweyr and
// summerset isle … building textures of desert"* is the request, even though the later games draw
// the Summerset Isles in pale, temperate stone.

/** The sibling corpus's race banks, in `game/names.js`'s own keys. */
export const RACE_NAME_BANKS = Object.freeze([
  'breton', 'redguard', 'nord', 'darkElf', 'highElf', 'woodElf', 'khajiit', 'imperial',
]);

/**
 * Where Skyrim stops being the frozen north: a world-map `y`, south of which the ground is the
 * province's ordinary country. The province's own rectangle runs y 22…75 (`CITYDATA.64`), so this
 * line keeps the hold-cities of the south — the tundra, the Rift, the Reach's foothills — temperate
 * and the northern holds mountain, which is the mix the owner asked for.
 */
export const SKYRIM_SNOW_LINE = 50;

/**
 * The provinces. A `null` field means *the place's own pixel* (D-38), never "temperate by accident".
 *
 * `people` is a weighted pool: a race appears as many times as its weight, the **first entry is the
 * province's own people**, and every key is one of `RACE_NAME_BANKS`. Black Marsh has no Argonian
 * bank to draw from — the corpus holds eight races and **no `argonian` key** (measured:
 * `game/names.js`'s bank table) — so its folk carry the closest names the file has, and the row in
 * `docs/DEFECTS.md` names that gap rather than inventing a bank.
 *
 * @type {Readonly<Record<number, {name: string, ground: string|null, architecture: string|null,
 *   weather?: string|null, groundSouth?: {line: number, ground: string}, people: readonly string[]}>>}
 */
export const PROVINCE_STYLE = Object.freeze({
  0: {
    name: 'High Rock',
    ground: null,
    architecture: null,
    people: ['breton', 'breton', 'breton', 'redguard', 'nord', 'highElf', 'darkElf', 'woodElf'],
  },
  1: {
    name: 'Hammerfell',
    ground: null,
    architecture: null,
    people: ['redguard', 'redguard', 'redguard', 'khajiit', 'nord', 'breton', 'imperial', 'darkElf'],
  },
  2: {
    name: 'Skyrim',
    // The owner's mix: the south is ordinary country, the north is the frozen north.
    ground: 'mountain',
    groundSouth: { line: SKYRIM_SNOW_LINE, ground: 'temperate' },
    architecture: null,
    people: ['nord', 'nord', 'nord', 'breton', 'imperial', 'darkElf', 'redguard', 'highElf'],
  },
  3: {
    name: 'Morrowind',
    // *"morrowind should be mostly desert but with mountain architecture"*.
    ground: 'desert',
    architecture: 'mountain',
    people: ['darkElf', 'darkElf', 'darkElf', 'darkElf', 'highElf', 'woodElf', 'nord', 'imperial'],
  },
  4: {
    name: 'Summurset Isle',
    // *"elsweyr and summerset isle should be temperate but with trees and building textures of desert"*.
    ground: 'temperate',
    architecture: 'desert',
    people: ['highElf', 'highElf', 'highElf', 'woodElf', 'breton', 'khajiit', 'imperial', 'darkElf'],
  },
  5: {
    name: 'Valenwood',
    ground: null,
    architecture: null,
    people: ['woodElf', 'woodElf', 'woodElf', 'highElf', 'khajiit', 'breton', 'imperial', 'darkElf'],
  },
  6: {
    name: 'Elsweyr',
    // The province is savannah and sand in the later games; the owner wants its *country* temperate
    // with trees and its buildings desert, which is what the row says.
    ground: 'temperate',
    architecture: 'desert',
    people: ['khajiit', 'khajiit', 'khajiit', 'woodElf', 'imperial', 'redguard', 'breton', 'darkElf'],
  },
  7: {
    name: 'Black Marsh',
    ground: null,
    architecture: null,
    people: ['imperial', 'imperial', 'darkElf', 'khajiit', 'woodElf', 'breton', 'redguard', 'highElf'],
  },
  8: {
    name: 'Imperial Province',
    ground: null,
    architecture: null,
    people: ['imperial', 'imperial', 'imperial', 'breton', 'nord', 'redguard', 'khajiit', 'darkElf'],
  },
});

/**
 * Named places with a reading of their own, because a province is not uniform.
 *
 * *Sentinel* is the owner's own words — *"sentinel should be desert"* — and the later games agree:
 * the city stands on the Alik'r. Its world pixel is mountain (measured: Hammerfell's mountain
 * settlements are Sentinel, Dragonstar, Elinhir, Belkarth Guard, Chasetown, Thorstad Place, Nimbel
 * Moor), so the province table cannot carry it.
 *
 * *Winterhold* is *"in some cities like winterhold it never needs to stop snowing"*: its sky is snow
 * at every hour of every day, which is the one place in the released world the game's own weather
 * letters cannot say (the sky is chosen by the level's `.INF` letter, and a city's letter is
 * `TCN`/`MCN`/`DCN` by climate).
 *
 * @type {ReadonlyArray<{province: number, name: string, ground?: string, architecture?: string, weather?: string}>}
 */
export const PLACE_STYLE = Object.freeze([
  { province: 1, name: 'Sentinel', ground: 'desert' },
  { province: 2, name: 'Winterhold', weather: 'snow' },
]);

/** The bank pool a province's people are named from, or null for a province this table has none for. */
export function nameBanksFor(provinceID) {
  return PROVINCE_STYLE[provinceID]?.people ?? null;
}

/** The province's own race — the first entry of its pool, i.e. the one its people mostly are. */
export function raceOf(provinceID) {
  return nameBanksFor(provinceID)?.[0] ?? null;
}

/**
 * Resolve a place's two climates and its weather.
 *
 * Order, and it is the order that keeps D-38 intact: a named place's own reading wins, then the
 * province's, then **the pixel's own class** — so a place this table says nothing about is exactly
 * what the game's `TERRAIN.IMG` says it is.
 *
 * @param {{provinceID: number, name?: string, terrainClimate: 'temperate'|'mountain'|'desert',
 *   global?: {x: number, y: number}}} place
 * @returns {{ground: 'temperate'|'mountain'|'desert', architecture: 'temperate'|'mountain'|'desert'|null,
 *   weather: string|null, terrainClimate: string, named: boolean, province: string|null}}
 */
export function styleOf(place) {
  const province = PROVINCE_STYLE[place.provinceID] ?? null;
  const named = PLACE_STYLE.find((p) => p.province === place.provinceID && p.name === place.name) ?? null;
  // Skyrim's own mix is a latitude, so it is read before the province's flat ground and after a
  // named place's own row (which is how Winterhold stays a city of the north).
  const fromLatitude = province?.groundSouth && place.global
    && place.global.y >= province.groundSouth.line
    ? province.groundSouth.ground
    : null;
  // The latitude mix is read **before** the province's flat ground, or Skyrim's `mountain` would
  // answer for its own south as well.
  const ground = named?.ground ?? fromLatitude ?? province?.ground ?? place.terrainClimate;
  return {
    ground,
    architecture: named?.architecture ?? province?.architecture ?? null,
    weather: named?.weather ?? province?.weather ?? null,
    terrainClimate: place.terrainClimate,
    named: Boolean(named),
    province: province?.name ?? null,
  };
}
