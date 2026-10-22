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
// A place has separate ground and settlement-architecture climates. Wilderness can optionally get
// its own scenery climate too, without changing the settlement or the ground. The module also owns
// the weather and people properties that go with a place:
//
//   * **`ground`** — the country, the road, the creatures and the sky. It defaults to the pixel's
//     own class (D-38), which is why the eight default rows are `null`.
//   * **`architecture`** — what the settlement's `.INF` is built from (`TC*`, `MC*`, `DC*`), which is
//     what the player sees as *architecture*. It too defaults to the pixel's class.
//   * **`wildernessArchitecture`** — an optional climate for wilderness trees and scenery. It changes
//     the wilderness `.INF` while the floor textures are still taken from `ground`; if absent, the
//     wilderness keeps using its ground climate for both.
//   * **`settlementTreeClimate`** — an optional source of tree art in city/town/village INF flat slots.
//     It is independent of settlement `architecture`, so a province can retain desert buildings
//     while using temperate trees. Only tree-art entries are borrowed; all other architecture stays.
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
 * THE RACES A PROVINCE'S STREET IS MADE OF — the eight name banks **plus `argonian`**.
 *
 * This is a *second* list and not `RACE_NAME_BANKS`, and the difference is the substantive one:
 * the sibling corpus ships eight race name banks and **no `argonian` bank**, so a province's
 * `people` (the banks its folk are *named* from) cannot express an Argonian majority — but the
 * later games' Black Marsh is Argonian, which is what `raceMix` below says. The nine keys here are
 * the races `game/raceSkin.js` carries a skin for, and the two tables are keyed the same way.
 *
 * **Not here: the Orcs.** The archive ships an `ORC` creature sheet and the later games put a
 * substantial Orc population in High Rock (Orsinium) and in Hammerfell; there is no Orc *bank* and
 * no Orc skin, so Orsinium's people are Bretons on this street, and the gap is named here rather
 * than papered over with a key nothing can answer.
 */
export const RACE_KEYS = Object.freeze([
  'breton', 'redguard', 'nord', 'darkElf', 'highElf', 'woodElf', 'khajiit', 'argonian', 'imperial',
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
 * A row carries **two weighted pools, and they answer two different questions**:
 *
 *   * **`people`** is the *name* pool: the sibling corpus's race banks (`RACE_NAME_BANKS`, eight of
 *     them), the **first entry repeated most** because it is the province's own people. Black Marsh
 *     has no Argonian bank to draw from — the corpus holds eight races and **no `argonian` key**
 *     (measured: `game/names.js`'s bank table) — so its folk carry the closest names the file has,
 *     and the row in `docs/DEFECTS.md` names that gap rather than inventing a bank.
 *   * **`raceMix`** is the *race* pool, and it is what the people **are**: the same weights over
 *     `RACE_KEYS`, which is `RACE_NAME_BANKS` plus `argonian`, because the one province whose race
 *     the corpus cannot name is the one the owner named by its race (*"in blackmarsh i want lizard
 *     mans repurpused as npcs to simulate argonians"*). A race appears as many times as its weight
 *     and **the first entry is the province's own race** — the law `people` follows for names, said
 *     for races, so the marsh is Argonians first and Imperials second even though its *names* come
 *     from the Imperial bank first.
 *
 * **No province carries a `weather`, and that is a decision rather than an omission.** The owner
 * named exactly two places whose sky does one thing for ever — *"in winterhold and windhelm never
 * needs to stop snowing"* — and both are **cities on one province's north coast, not the province**:
 * the later games keep seasons everywhere a province is not the far north. High Rock and Cyrodiil
 * have clear, grey and wet days; Hammerfell's Alik'r is dry but not weatherless; Morrowind's ash
 * storms are Vvardenfell's, not the mainland's; Valenwood's rainforest rains without never
 * stopping; the Summerset Isles, Elsweyr and Black Marsh each have ordinary seasons; and Skyrim
 * *itself* is the mix the owner asked for (the hold line below). So the only rows with a `weather`
 * are the two cities in `PLACE_STYLE` (`game/arenaSky.js`'s `precipitationMode` then draws it at
 * every hour of every day), and a province that wanted one would have to be named there too.
 *
 * @type {Readonly<Record<number, {name: string, ground: string|null, architecture: string|null,
 *   wildernessArchitecture?: string|null, settlementTreeClimate?: string|null, weather?: string|null,
 *   groundSouth?: {line: number, ground: string},
 *   people: readonly string[], raceMix: readonly string[]}>>}
 */
export const PROVINCE_STYLE = Object.freeze({
  0: {
    name: 'High Rock',
    ground: null,
    architecture: null,
    raceMix: ['breton', 'breton', 'breton', 'breton', 'breton', 'redguard', 'nord', 'highElf'],
    people: ['breton', 'breton', 'breton', 'redguard', 'nord', 'highElf', 'darkElf', 'woodElf'],
  },
  1: {
    name: 'Hammerfell',
    ground: null,
    architecture: null,
    raceMix: ['redguard', 'redguard', 'redguard', 'redguard', 'redguard', 'breton', 'imperial', 'khajiit'],
    people: ['redguard', 'redguard', 'redguard', 'khajiit', 'nord', 'breton', 'imperial', 'darkElf'],
  },
  2: {
    name: 'Skyrim',
    // The owner's mix: the south is ordinary country, the north is the frozen north.
    ground: 'mountain',
    groundSouth: { line: SKYRIM_SNOW_LINE, ground: 'temperate' },
    architecture: null,
    raceMix: ['nord', 'nord', 'nord', 'nord', 'nord', 'breton', 'imperial', 'darkElf'],
    people: ['nord', 'nord', 'nord', 'breton', 'imperial', 'darkElf', 'redguard', 'highElf'],
  },
  3: {
    name: 'Morrowind',
    // *"morrowind should be mostly desert but with mountain architecture"*.
    ground: 'desert',
    architecture: 'mountain',
    // The wilderness uses the same mountain scenery as the towns, with the desert floors below.
    wildernessArchitecture: 'mountain',
    // *"in morrowind mostly dark elf npcs"* — five in eight, and the later games' own minorities
    // beside them (the Imperial administration, the Nord raiders of the north coast, and the
    // Argonian and Khajiit labour the province is infamous for).
    raceMix: ['darkElf', 'darkElf', 'darkElf', 'darkElf', 'darkElf', 'imperial', 'nord', 'argonian'],
    people: ['darkElf', 'darkElf', 'darkElf', 'darkElf', 'highElf', 'woodElf', 'nord', 'imperial'],
  },
  4: {
    name: 'Summurset Isle',
    // Keep temperate ground and desert buildings. The settlement INF borrows only temperate tree
    // art; wilderness already falls back to the temperate ground climate and stays unchanged.
    ground: 'temperate',
    architecture: 'desert',
    settlementTreeClimate: 'temperate',
    raceMix: ['highElf', 'highElf', 'highElf', 'highElf', 'highElf', 'woodElf', 'breton', 'khajiit'],
    people: ['highElf', 'highElf', 'highElf', 'woodElf', 'breton', 'khajiit', 'imperial', 'darkElf'],
  },
  5: {
    name: 'Valenwood',
    ground: null,
    architecture: null,
    raceMix: ['woodElf', 'woodElf', 'woodElf', 'woodElf', 'woodElf', 'highElf', 'khajiit', 'breton'],
    people: ['woodElf', 'woodElf', 'woodElf', 'highElf', 'khajiit', 'breton', 'imperial', 'darkElf'],
  },
  6: {
    name: 'Elsweyr',
    // The country stays temperate; its settlement buildings and wilderness scenery use the desert
    // style, with the wilderness's ground textures merged separately.
    ground: 'temperate',
    architecture: 'desert',
    // Keep the country temperate, but draw wilderness trees and scenery from the desert INF.
    wildernessArchitecture: 'desert',
    raceMix: ['khajiit', 'khajiit', 'khajiit', 'khajiit', 'khajiit', 'imperial', 'woodElf', 'breton'],
    people: ['khajiit', 'khajiit', 'khajiit', 'woodElf', 'imperial', 'redguard', 'breton', 'darkElf'],
  },
  7: {
    name: 'Black Marsh',
    ground: null,
    architecture: null,
    // **The one row whose race is not its name bank**, and the reason `raceMix` exists at all:
    // *"in blackmarsh i want lizard mans repurpused as npcs to simulate argonians"*. The marsh's
    // people are Argonians first, and there is no Argonian bank, so their *names* come from the
    // closest banks the corpus carries while the street says what they are.
    raceMix: ['argonian', 'argonian', 'argonian', 'argonian', 'argonian', 'imperial', 'khajiit', 'darkElf'],
    people: ['imperial', 'imperial', 'imperial', 'khajiit', 'woodElf', 'breton', 'redguard', 'darkElf'],
  },
  8: {
    name: 'Imperial Province',
    ground: null,
    architecture: null,
    raceMix: ['imperial', 'imperial', 'imperial', 'imperial', 'imperial', 'breton', 'nord', 'redguard'],
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
 * **The two cities whose sky never changes, and they are the owner's own pair.** *"in winterhold
 * and windhelm never needs to stop snowing"* — Winterhold and Windhelm, both on Skyrim's north
 * coast, and the later games agree: Winterhold is a snow-blown, ice-bound coast and Windhelm a
 * very cold northern port known for its blizzards. (The lore describes severe cold and frequent
 * snow rather than an explicit rule of perpetual snowfall, so *perpetual* here is the owner's own
 * instruction, carried as this project's rule and stamped as such.) Their sky is snow at every
 * hour of every day, which is the one thing the game's own weather letters cannot say: the sky is
 * chosen by the level's `.INF` letter and a city's letter is `TCN`/`MCN`/`DCN` by climate alone.
 *
 * Sentinel is the third row and is a *ground* rather than a weather: the owner's *"sentinel should
 * be desert"* (see above). No other place in the released world carries either.
 *
 * @type {ReadonlyArray<{province: number, name: string, ground?: string, architecture?: string, weather?: string}>}
 */
export const PLACE_STYLE = Object.freeze([
  { province: 1, name: 'Sentinel', ground: 'desert' },
  { province: 2, name: 'Winterhold', weather: 'snow' },
  { province: 2, name: 'Windhelm', weather: 'snow' },
  { province: 8, name: 'Bruma', ground: 'mountain', weather: 'snow' },
]);

/**
 * WHAT A PROVINCE'S STREET IS MADE OF — the art its crowd is drawn from (block **B11**, D-45).
 *
 * The owner's own words: *"in morrowind mostly dark elf npcs in skyrim mostly nords and in
 * blackmarsh i want lizard mans repurpused as npcs to simulate argonians … all provinces should
 * have a mix of people but mostly their race of people"*.
 *
 * **The honest half, first: this install draws ONE human body.** `GLOBAL.BSA` ships no Dunmer
 * skin, no Nord skin and no Khajiit — 340 `.CFA` files, and the human ones are the armoured roster
 * (`0UNA`…`1MNK`), the citizens (`MLGEN`/`FMGEN`), the watch, `BABE` and `LGLIT`.
 *
 * **The palette is NOT the missing half, and this header used to say it was** (corrected here).
 * `GLOBAL.BSA`'s own extensions are `IMG MIF CFA SET INF DFA VOC RMD CIF XFM XMI` — no `.COL`,
 * no `.PAL` — but the **install directory** ships four loose palettes beside the archive:
 * `PAL.COL` (the global one the walls *and* the figures are drawn with), `CHARSHT.COL`,
 * `DAYTIME.COL` and `DREARY.COL`. What is missing is the **rule**, not the palette: which colour a
 * race's skin takes is Arena's own and lives inside `ACD.EXE`. The art's half has now been measured
 * off those bytes: the citizen sheets (`MLGEN01W.CFA`, `FMGENW01.CFA`, `BABE01.CFA`) paint skin
 * with **one contiguous run of `PAL.COL` — indices 229, 231, 232, 234, 235, 236**, a light-to-dark
 * ladder from `#bb9477` to `#5a2d24` — while their cloth and metal use other runs entirely
 * (32–39 and 55/101 steel, 75–81 teal, 130–133/138 red, 161–167 green, 148–152/154 dark brown).
 * That run is the ladder a race's skin would be built on.
 *
 * **What the archive does have is the stand-in the owner asked for**: `LIZARD1.CFA`…`LIZARD6.CFA`,
 * the Lizard Man's five directions and its death, read by `peopleKinds.js`'s
 * `standInKindsFromListing` as the marsh's folk. That one is race-specific art and it is used as
 * such.
 *
 * So a pool is a **weighted list of roster keys** — a key repeated is a key more likely drawn —
 * naming the art a province's street is built from. A pool expresses what a province is *made of*
 * (its trades, its armour, its guard). For a province whose race this install cannot draw, the
 * **pool** is the honest half of the answer and the **skin** is D-45's palette half — named as a
 * gap, not pretended away.
 *
 * Keys are `townsfolk.js`'s outfit keys (`<sex><armour>`, sex `0` a man and `1` a woman — the
 * archive's own digit, `peopleKinds.js`'s header) and `peopleKinds.js`'s kind keys; `ARGONIAN` is
 * the one stand-in. `tests/unit/provincestyle.test.mjs` holds every key in every pool against the
 * roster the install actually provides, so a typo cannot quietly empty a city.
 *
 * @type {Readonly<Record<number, {pool: readonly string[], note: string}>>}
 */
export const PEOPLE_ART = Object.freeze({
  // High Rock — Bretons: a temperate, mercantile street. Plain clothes and leather first.
  // **Four citizens, not two** (2026-10-18): `MLGENT` (`MLGEN0#T`) and `FMGENW` (`FMGENW0#`) are
  // the second man and second woman the archive draws, measured to be separate figures with
  // their own strides (`peopleKinds.js`). `BABE0` is the third woman.
  0: { pool: ['MLGEN', 'MLGENT', 'FMGEN', 'FMGENW', 'BABE0', '0UNA', '0LTR', '1UNA', '1LTR', '0CHN', 'GUARD0'], note: 'a Breton province: the town\u2019s own men and women, the watch, and few soldiers' },
  // Hammerfell — Redguards: the Alik'r, so more of the street carries a blade.
  1: { pool: ['MLGEN', 'MLGENT', 'FMGEN', 'FMGENW', '0CHN', '0LTR', '1UNA', '1LTR', 'BABE0', '0BAR', 'GUARD0'], note: 'a Redguard province: chain and leather before cloth' },
  // Skyrim — Nords: the frozen north, and the heaviest armour this archive draws.
  2: { pool: ['MLGEN', 'MLGENT', 'FMGEN', 'FMGENW', '0BAR', '0PLT', '1BAR', '0CHN', 'BABE0', 'GUARD0', '0UNA'], note: 'a Nord province: barbarian and plate armour on the street' },
  // Morrowind — Dunmer: this install draws no Dunmer, so the pool is the province\u2019s trade mix.
  3: { pool: ['MLGEN', 'MLGENT', 'FMGEN', 'FMGENW', '0LTR', '0MAG', '1LTR', '1MAG', '0MNK', 'BABE0', 'GUARD0'], note: 'a Dunmer province: leather, robes and the mages\u2019 trade \u2014 the skin is the archive\u2019s own, and no Dunmer art ships' },
  // Summurset Isle — Altmer: mages and robed folk before armour.
  4: { pool: ['MLGEN', 'MLGENT', 'FMGEN', 'FMGENW', '0MAG', '1MAG', '0LTR', '0UNA', 'BABE0', 'GUARD0', '1LTR'], note: 'an Altmer province: mages\u2019 robes before armour' },
  // Valenwood — Bosmer: foresters in leather and plain clothes.
  5: { pool: ['MLGEN', 'MLGENT', 'FMGEN', 'FMGENW', '0LTR', '0UNA', '0MNK', '1LTR', 'BABE0', 'GUARD0', '1UNA'], note: 'a Bosmer province: leather and the monks\u2019 habit' },
  // Elsweyr — Khajiit: **the snow wolf repainted tawny stands in** (the owner, 2026-10-18), the
  // same discipline as the marsh's Lizard Man.
  6: { pool: ['KHAJIIT', 'KHAJIIT', 'KHAJIIT', 'KHAJIIT', 'MLGEN', 'MLGENT', 'FMGEN', 'FMGENW', 'BABE0', '0UNA', '0LTR', 'GUARD0'], note: 'a Khajiit province: the snow wolf\u2019s own sheets stand in, repainted orange with stripes' },
  // Black Marsh — Argonians: **the Lizard Man's own sheets stand in**, which is the owner\u2019s
  // request and the one race-specific art this archive carries.
  7: { pool: ['ARGONIAN', 'ARGONIAN', 'ARGONIAN', 'ARGONIAN', 'ARGONIAN', 'ARGONIAN', 'ARGONIAN', 'ARGONIAN', 'MLGEN', 'MLGENT', 'FMGEN', 'FMGENW', '0UNA', '0LTR', 'GUARD0'], note: 'an Argonian province: the Lizard Man\u2019s own sheets stand in for the Argonians this install does not draw' },
  // The Imperial Province — Imperials: the civilised centre, plate and chain on its watch.
  8: { pool: ['MLGEN', 'MLGENT', 'FMGEN', 'FMGENW', '0PLT', '0CHN', '1CHN', 'BABE0', 'GUARD0', '0LTR', '1LTR'], note: 'an Imperial province: the watch in plate and chain' },
});

/** The art a province's crowd is drawn from, or null for a province this table has none for. */
export function peopleArtFor(provinceID) {
  return PEOPLE_ART[provinceID] ?? null;
}

/** The bank pool a province's people are named from, or null for a province this table has none for. */
export function nameBanksFor(provinceID) {
  return PROVINCE_STYLE[provinceID]?.people ?? null;
}

/**
 * The **name bank** a province's people are named from first — the bank the corpus has.
 *
 * Note this is a *bank* and not a race: Black Marsh answers `imperial` here because the corpus
 * ships no Argonian bank, while `ownRaceOf(7)` answers `argonian` because that is what the marsh's
 * people are. `game/names.js` is the consumer of this one.
 */
export function raceOf(provinceID) {
  return nameBanksFor(provinceID)?.[0] ?? null;
}

/** The weighted **race** pool a province's street is drawn from (`RACE_KEYS`), or null. */
export function raceMixFor(provinceID) {
  return PROVINCE_STYLE[provinceID]?.raceMix ?? null;
}

/**
 * The **race** a province's people mostly are — the first entry of its `raceMix`.
 *
 * The owner's law, said for races: *"all provinces should have a mix of people but mostly their
 * race of people"*. `game/raceSkin.js` turns this key into a skin; `docs/DEFECTS.md` D-45's palette
 * half is what remains of the art it needs.
 */
export function ownRaceOf(provinceID) {
  return raceMixFor(provinceID)?.[0] ?? null;
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
 *   wildernessArchitecture: 'temperate'|'mountain'|'desert'|null,
 *   settlementTreeClimate: 'temperate'|'mountain'|'desert'|null, weather: string|null,
 *   terrainClimate: string, named: boolean, province: string|null}}
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
    wildernessArchitecture: province?.wildernessArchitecture ?? null,
    settlementTreeClimate: province?.settlementTreeClimate ?? null,
    weather: named?.weather ?? province?.weather ?? null,
    terrainClimate: place.terrainClimate,
    named: Boolean(named),
    province: province?.name ?? null,
  };
}
