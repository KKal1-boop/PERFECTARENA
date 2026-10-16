// THE IMPERIAL PROVINCE — the one province Arena's own file leaves empty (**block B16**,
// defect `D-39`).
//
// `CITYDATA.64` gives every province 32 settlements and 16 dungeons, and eight of the nine
// provinces name all 32. The ninth — the Imperial Province, the middle of Tamriel and the
// one province a new player is standing in — names **one**: the Imperial City. Its other
// thirty-one records are all-zero placeholders (no name, local point (0,0), visibility 0),
// measured by reading the file:
//
//   [8] Imperial Province: { city: 1, 'city (nameless)': 7, 'town (nameless)': 8,
//                            'village (nameless)': 16, 'dungeon (nameless)': 16 }
//
// Thirty-one records like that are not thirty-one places, and the port was treating them as
// thirty-one places in the worst possible way:
//
//   * every one of them resolves to the **same world pixel** — local (0,0) scales to the
//     province rectangle's own corner, (107,61) — so the world map drew thirty-one markers
//     stacked on one another at the top-left of the province, thirty of them unselectable;
//   * `citySeed` is the packed local point, so all thirty-one asked the city generator for
//     **the same city** (seed 0) and `wildernessSeed` is the name's first four letters, so
//     all thirty-one got the same country (seed 0) as well;
//   * `scenes/worldmap.js`'s `dungeonLabel` answers `location.name` for anything that is not
//     a dungeon, so the marker card's title, the map's label and the save's remembered
//     place were all the **empty string**;
//   * fast travel builds `?location=${name}` — so travelling to one of them asked the next
//     page to boot a place called nothing.
//
// **What this module does instead.** In Arena the Imperial Province is where the game
// begins and ends, and the later games — Oblivion (2006), its expansions, and Elder Scrolls
// Online's Cyrodiil — did the work Arena left undone: they gave Cyrodiil its nine cities and
// its villages, farms and priories, with regions (the Gold Coast, the West Weald, the Great
// Forest, Blackwood, the Jerall and Valus Mountains, Lake Rumare), a road network and a
// compass. The owner's own rule for this project is to take the **later** reading of Tamriel
// lore where Arena's and the later games' disagree, and here they cannot disagree: Arena
// wrote nothing at all. So the province is filled from the later lore, and what that gives
// the player is a Cyrodiil with places in it — Anvil and Kvatch on the Gold Coast, Skingrad
// in the West Weald, Bravil on Niben Bay, Leyawiin at the Niben's mouth, Cheydinhal under
// the Valus Mountains, Bruma below the Jerall pass, Chorrol in the Great Forest — and the
// villages, farms and priories around them.
//
// **PROVENANCE, which matters more here than anywhere.** Two of the three things this table
// carries are sourced and one is this project's own:
//
//   * **The names and the kinds are the later games'** (and UESP's classification of them):
//     the eight major cities from Oblivion; Oblivion's settlements page
//     (`en.uesp.net/wiki/Oblivion:Settlements`) for the villages and farms; UESP's
//     `Lore:Sutch` for Sutch (a city in the lore, a settlement in ESO, cut from Oblivion
//     and surviving there as Fort Sutch's ruins); UESP's `Online:Vlastarus` and
//     `Online:Cyrodiil` for Vlastarus (a **town** in ESO, in no Oblivion list).
//   * **The directions are sourced too**: UESP's settlement pages give each one's
//     neighbourhood ("north of the Imperial City", "between Skingrad and Chorrol", "on the
//     Gold Coast south-east of Anvil"), and `Lore:Pale_Pass` and UESP's roads and regions
//     pages pin the edges (the Jeralls to the north, the Valus to the north-east, the
//     Colovian Highlands to the north-west, the Gold Coast to the south-west, Blackwood to
//     the south).
//   * **The pixel is this project's own**, and it has to be: **nothing in Arena's install
//     has a coordinate for any of them** (`A.EXE` would not either — this province's records
//     are empty in the released file, not truncated by this project). Each entry carries the
//     later lore's direction as a **fraction of the province rectangle** (`at: [west→east,
//     north→south]`), and `localPointOf` turns that into the `local` point a `CITYDATA`
//     record carries: the world map's own 320×200 space, which `cityDataFile.globalPoint`
//     then scales into the rectangle. A direction read off a UESP sentence is not a
//     surveyor's position; it is *where the later games put the place inside Cyrodiil*, and
//     it is stamped as such in `docs/DEFECTS.md` D-39.
//
// **Which thirty-one.** The kingdom's own shape decides the split, because a `CITYDATA`
// province has exactly 8 city-states, 8 towns and 16 villages and the slots cannot be
// reordered: seven of Oblivion's eight cities take the seven free city-state slots, and
// **Kvatch is the town** — the one reading the later games themselves support, since Kvatch
// is the city the Oblivion Crisis burned and left "a town in ruin" (UESP: Oblivion:Kvatch).
// The eight towns are Kvatch, Weye, Cropsford, Hackdirt, Vlastarus, Sutch, Weynon Priory and
// Gottlesfont Priory; the sixteen villages are Oblivion's eight remaining villages and eight
// of its farms. UESP's settlements page lists more (Lord Drad's and Lord Rugdumph's estates,
// Shetcombe Farm, the Priory of the Nine, Cloud Ruler Temple, the player's own strongholds,
// four isolated buildings); the table takes the sixteen that cover the province's regions,
// one per direction, and leaves the rest to another pass rather than inventing slots for
// them — a `CITYDATA` record is a settlement the game can *draw*, and every entry here has to
// pay for its slot with a city skeleton, a name and a country.
//
// The Imperial City itself is **not** in this table: the file names it and gives it a local
// point, and it keeps the game's own answer (its record is untouched).

/** The Imperial Province's index in `CITYDATA.64`. */
export const IMPERIAL_PROVINCE_ID = 8;

/** The world map's local space, in which a record's `local` point lives. */
const LOCAL_SIZE = Object.freeze({ width: 320, height: 200 });

/**
 * Cyrodiil's thirty-one places, in the file's own slot order: it fills `city` indices 1–7,
 * `town` indices 0–7 and `village` indices 0–15 of province 8.
 *
 * `at` is `[west→east, north→south]`, as a fraction of the province rectangle, read off the
 * later games' own geography (see this file's header). `source` says which later work the
 * name and the kind come from.
 *
 * @type {ReadonlyArray<{name: string, kind: 'city'|'town'|'village', index: number,
 *   at: readonly [number, number], source: string}>}
 */
export const CYRODIIL_SETTLEMENTS = Object.freeze([
  // ── the seven free city-state slots: Oblivion's cities, less Kvatch ──────────────────────
  { name: 'Anvil', kind: 'city', index: 1, at: [0.05, 0.60], source: 'oblivion' },
  { name: 'Bruma', kind: 'city', index: 2, at: [0.50, 0.07], source: 'oblivion' },
  { name: 'Bravil', kind: 'city', index: 3, at: [0.55, 0.73], source: 'oblivion' },
  { name: 'Cheydinhal', kind: 'city', index: 4, at: [0.81, 0.25], source: 'oblivion' },
  { name: 'Chorrol', kind: 'city', index: 5, at: [0.19, 0.21], source: 'oblivion' },
  { name: 'Leyawiin', kind: 'city', index: 6, at: [0.72, 0.93], source: 'oblivion' },
  { name: 'Skingrad', kind: 'city', index: 7, at: [0.33, 0.63], source: 'oblivion' },

  // ── the eight town slots ────────────────────────────────────────────────────────────────
  // Kvatch is a town here because the later games made it one: sacked and burned in the
  // Oblivion Crisis. It is the only Oblivion city this province does not give a city-state
  // slot to, and the slot count is Arena's, not this table's.
  { name: 'Kvatch', kind: 'town', index: 0, at: [0.17, 0.76], source: 'oblivion' },
  { name: 'Weye', kind: 'town', index: 1, at: [0.41, 0.52], source: 'oblivion' },
  { name: 'Cropsford', kind: 'town', index: 2, at: [0.66, 0.61], source: 'oblivion' },
  { name: 'Hackdirt', kind: 'town', index: 3, at: [0.15, 0.37], source: 'oblivion' },
  { name: 'Sutch', kind: 'town', index: 4, at: [0.03, 0.47], source: 'eso' },
  { name: 'Vlastarus', kind: 'town', index: 5, at: [0.26, 0.72], source: 'eso' },
  { name: 'Weynon Priory', kind: 'town', index: 6, at: [0.27, 0.29], source: 'oblivion' },
  { name: 'Gottlesfont Priory', kind: 'town', index: 7, at: [0.25, 0.42], source: 'oblivion' },

  // ── the sixteen village slots: Oblivion's villages, then its farms ──────────────────────
  { name: 'Aleswell', kind: 'village', index: 0, at: [0.50, 0.34], source: 'oblivion' },
  { name: 'Bleaker\u2019s Way', kind: 'village', index: 1, at: [0.45, 0.20], source: 'oblivion' },
  { name: 'Pell\u2019s Gate', kind: 'village', index: 2, at: [0.54, 0.63], source: 'oblivion' },
  { name: 'Brindle Home', kind: 'village', index: 3, at: [0.29, 0.52], source: 'oblivion' },
  { name: 'Harlun\u2019s Watch', kind: 'village', index: 4, at: [0.79, 0.37], source: 'oblivion' },
  { name: 'Water\u2019s Edge', kind: 'village', index: 5, at: [0.57, 0.88], source: 'oblivion' },
  { name: 'Border Watch', kind: 'village', index: 6, at: [0.65, 0.85], source: 'oblivion' },
  { name: 'Blankenmarch', kind: 'village', index: 7, at: [0.87, 0.79], source: 'oblivion' },
  { name: 'Weatherleah', kind: 'village', index: 8, at: [0.22, 0.49], source: 'oblivion' },
  { name: 'Odiil Farm', kind: 'village', index: 9, at: [0.26, 0.36], source: 'oblivion' },
  { name: 'Shardrock', kind: 'village', index: 10, at: [0.30, 0.72], source: 'oblivion' },
  { name: 'Gweden Farm', kind: 'village', index: 11, at: [0.14, 0.84], source: 'oblivion' },
  { name: 'Whitmond Farm', kind: 'village', index: 12, at: [0.06, 0.53], source: 'oblivion' },
  { name: 'Applewatch', kind: 'village', index: 13, at: [0.35, 0.13], source: 'oblivion' },
  { name: 'Drakelowe', kind: 'village', index: 14, at: [0.87, 0.41], source: 'oblivion' },
  { name: 'Harm\u2019s Folly', kind: 'village', index: 15, at: [0.66, 0.13], source: 'oblivion' },
]);

/**
 * The `local` point a `CITYDATA` record carries for a fraction of its province.
 *
 * The local space is the world map's own 320×200 (`cityDataFile.WORLD_MAP_SIZE`), and
 * `globalPoint` scales a local point into the province's rectangle — so a fraction becomes
 * `round(fraction × 320)` horizontally and `round(fraction × 200)` vertically, which is the
 * same arithmetic in the same units the rest of the world uses.
 *
 * @param {readonly [number, number]} at
 * @returns {{x: number, y: number}}
 */
export function localPointOf(at) {
  return {
    x: Math.round(at[0] * LOCAL_SIZE.width),
    y: Math.round(at[1] * LOCAL_SIZE.height),
  };
}

/**
 * The later-lore place that belongs in a record, or null when this table has none for it.
 *
 * A record is a placeholder when it has no name; the imperial records also carry local
 * (0,0), and the table is keyed on the **slot** (`kind` plus the kind-local `index`) rather
 * than on the coordinates, because the slot is what the file's order fixes.
 *
 * @param {{kind: string, index: number}} location
 */
export function cyrodiilEntryFor(location) {
  if (location.kind === 'dungeon') return null;
  return CYRODIIL_SETTLEMENTS.find((e) => e.kind === location.kind && e.index === location.index) ?? null;
}

/**
 * Give the Imperial Province its places.
 *
 * The province's named records (the Imperial City) pass through untouched: the file's own
 * answer beats this table's. Every nameless record is looked up in the slot table and, when
 * found, becomes a placed location — same record id, same province, a name, a local point
 * and `placed: true`. A nameless record this table cannot place is **not a place** and is
 * left out of the world with a warning, because the alternative is what the port used to do:
 * a marker at someone else's pixel, a name of `''` in the player's card, and a city that is
 * the same city as thirty others.
 *
 * Only the Imperial Province is touched; the other eight name all thirty-two of their
 * settlements and must not be rewritten.
 *
 * @param {object[]} provinces the parsed provinces
 * @returns {{provinces: object[], warnings: string[], filled: number}}
 */
export function fillImperialProvince(provinces) {
  const warnings = [];
  let filled = 0;
  const out = provinces.map((province) => {
    if (province.id !== IMPERIAL_PROVINCE_ID) return province;
    const locations = [];
    for (const location of province.locations) {
      if (location.kind === 'dungeon' || location.name) {
        locations.push(location);
        continue;
      }
      const entry = cyrodiilEntryFor(location);
      if (!entry) {
        warnings.push(`${province.name}: record ${location.id} (${location.kind} ${location.index}) is a placeholder with no place in it, and the later lore has none for that slot`);
        continue;
      }
      filled++;
      locations.push({
        ...location,
        name: entry.name,
        local: localPointOf(entry.at),
        placed: true,
        source: entry.source,
      });
    }
    return { ...province, locations };
  });
  return { provinces: out, warnings, filled };
}
