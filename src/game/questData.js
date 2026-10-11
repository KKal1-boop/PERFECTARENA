// THE MAIN QUEST — AS DATA, FROM THE GAME'S OWN WORLD.
//
// Arena's story is a linear chain of ten steps: escape the Imperial Dungeons,
// find the eight pieces of the Staff of Chaos, then return to the Imperial Palace
// for the Jewel of Fire and the confrontation with Jagar Tharn.
//
// Almost none of it has to be authored. `CITYDATA.64` names **two quest dungeons
// per province** — one holding a Staff piece, one holding the map that reveals it
// (see `docs/FORMATS.md` §8c) — and the province's rectangle places both on the
// map. So the chain below is *derived*: the eight pieces are the eight provinces
// that are not the Imperial Province, ordered by the documented dungeon order, and
// each stage's location, seed and `.MIF` filename come out of the world data:
//
//   piece 1  Fang Lair          Hammerfell        map: Stonekeep
//   piece 2  Labyrinthian       Skyrim            map: Fortress of Ice
//   piece 3  Elden Grove        Valenwood         map: Selene's Web
//   piece 4  Halls of Colossus  Elsweyr           map: Temple of Agamanus
//   piece 5  Crystal Tower      Summurset Isle    map: Temple of Mad God
//   piece 6  Crypt of Hearts    High Rock         map: Mines of Khuras
//   piece 7  Murkwood           Black Marsh       map: Vaults of Gemin
//   piece 8  Dagoth-Ur          Morrowind         map: Black Gate
//
// The order is the one the game documents (UESP's *Arena: Main Quest*), and it is
// checked against the data: `tests/unit/quest.test.mjs` asserts that each named
// dungeon really is its province's quest dungeon in `CITYDATA.64`, in this order,
// and that each dungeon's seed really does name a `.MIF` the player's install has.
// A wrong order or a wrong province fails the suite rather than shipping.

import { mainQuestDungeonMifName } from '../arena/cityDataSeeds.js';
import { cityTypeOf } from '../arena/cityDataFile.js';

/**
 * The eight Staff-piece dungeons, in the order the game is meant to be played.
 * Each is matched by *name* against the province's staff dungeon, so a
 * discrepancy between this list and the data is caught rather than assumed.
 */
export const STAFF_DUNGEON_ORDER = Object.freeze([
  'Fang Lair', 'Labyrinthian', 'Elden Grove', 'Halls of Colossus',
  'Crystal Tower', 'Crypt of Hearts', 'Murkwood', 'Dagoth-Ur',
]);

/** The opening dungeon's files. Loose in the game folder, with its own `.INF`. */
export const START_DUNGEON = Object.freeze({ mif: 'START.MIF', inf: 'START.INF', name: 'Imperial Dungeons' });

/** The finale: the palace, whose four levels each have their own `.INF`. */
export const FINAL_DUNGEON = Object.freeze({ mif: 'IMPPAL.MIF', name: 'The Imperial Palace' });

/** Ria Silmane's stage texts. Arena tells the story through her dreams. */
export const STAGE_TEXT = Object.freeze([
  'You must escape this place. The Emperor is betrayed and only you know it.',
  'The first piece of the Staff of Chaos lies in Fang Lair, in Hammerfell. A parchment in Stonekeep names the way.',
  'The second piece lies in Labyrinthian, in Skyrim. The Fortress of Ice holds the map.',
  'The third piece lies in the Elden Grove of Valenwood. Selene\'s Web holds the map.',
  'The fourth piece lies in the Halls of Colossus, in Elsweyr. The Temple of Agamanus holds the map.',
  'The fifth piece lies in the Crystal Tower of Summurset Isle. The Temple of Mad God holds the map.',
  'The sixth piece lies in the Crypt of Hearts, in High Rock. The Mines of Khuras hold the map.',
  'The seventh piece lies in Murkwood, in Black Marsh. The Vaults of Gemin hold the map.',
  'The eighth piece lies in Dagoth-Ur, in Morrowind. Black Gate holds the map.',
  'The Staff is whole, but the Emperor\'s prison needs the Jewel of Fire. Return to the Imperial Palace.',
]);

/**
 * Build the quest chain from a loaded world.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @returns {{stages: object[], missing: string[], warnings: string[]}}
 */
export function buildQuestChain(world) {
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const warnings = [];

  const start = {
    index: 0,
    kind: 'escape',
    title: START_DUNGEON.name,
    text: STAGE_TEXT[0],
    mif: START_DUNGEON.mif,
    inf: START_DUNGEON.inf,
    provinceID: 8,
    province: 'Imperial Province',
    climate: 'temperate',
  };

  /** @type {object[]} */
  const pieces = [];
  for (let i = 0; i < STAFF_DUNGEON_ORDER.length; i++) {
    const wanted = STAFF_DUNGEON_ORDER[i];
    // Find the province whose quest dungeon is this named place.
    let found = null;
    for (const province of world.provinces) {
      const [staff, map] = world.questDungeonsOf(province.id);
      if (staff && staff.name.toLowerCase() === wanted.toLowerCase()) {
        found = { province, staff, map };
        break;
      }
    }
    if (!found) {
      missing.push(wanted);
      warnings.push(`no province in CITYDATA.64 has "${wanted}" as its staff dungeon`);
      continue;
    }
    const { province, staff, map } = found;
    pieces.push({
      index: i + 1,
      kind: 'piece',
      piece: i + 1,
      title: staff.name,
      text: STAGE_TEXT[i + 1],
      provinceID: province.id,
      province: province.name,
      climate: staff.climate,
      coastal: false,
      // The piece's dungeon, and the dungeon that reveals it.
      mif: staff.mif,
      dungeonSeed: staff.dungeonSeed,
      global: staff.global,
      clue: map
        ? { title: map.name, mif: map.mif, dungeonSeed: map.dungeonSeed, global: map.global }
        : null,
      // The nearest settlement, which is where a traveller arrives.
      nearestSettlement: nearestSettlement(world, staff.global),
    });
  }

  const finale = {
    index: 9,
    kind: 'finale',
    title: FINAL_DUNGEON.name,
    text: STAGE_TEXT[9],
    mif: FINAL_DUNGEON.mif,
    inf: 'IMPPAL1.INF',
    provinceID: 8,
    province: 'Imperial Province',
    climate: 'temperate',
    global: { x: 172, y: 106 },
  };

  return { stages: [start, ...pieces, finale], missing, warnings };
}

/**
 * The settlement closest to a world point, which is how a traveller reaches a
 * dungeon: you fast-travel to the nearest town and walk from there.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {{x: number, y: number}} point
 * @returns {{name: string, kind: string, province: string, citySeed: number, climate: string, coastal: boolean, global: object, distance: number}|null}
 */
export function nearestSettlement(world, point) {
  let best = null;
  for (const settlement of world.settlements()) {
    const distance = Math.hypot(settlement.global.x - point.x, settlement.global.y - point.y);
    if (!best || distance < best.distance) best = { settlement, distance: Math.round(distance) };
  }
  if (!best) return null;
  const s = best.settlement;
  return {
    name: s.name,
    kind: s.kind ?? cityTypeOf(s.index),
    province: s.province,
    citySeed: s.citySeed,
    climate: s.climate,
    coastal: s.coastal,
    global: s.global,
    distance: best.distance,
  };
}

/** The `.MIF` a stage's dungeon loads, or null when it is a fixed file. */
export function stageMif(stage) {
  if (stage.mif) return stage.mif;
  if (typeof stage.dungeonSeed === 'number') return mainQuestDungeonMifName(stage.dungeonSeed);
  return null;
}
