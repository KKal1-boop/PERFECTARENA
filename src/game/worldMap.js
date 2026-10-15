// THE WORLD OF TAMRIEL — where every Arena location is, and what it is.
//
// This module turns the game's own world files into a model the game can use:
//
//   `CITYDATA.64`  9 provinces × (rectangle + 48 locations)         (VERIFIED)
//   `TERRAIN.IMG`  320×200, one terrain class per pixel             (VERIFIED)
//   `TAMRIEL.IMG`  320×200 world map art, embedded palette          (VERIFIED)
//
// The province rectangles **tile the whole continent**, so the map *is* Tamriel:
// Hammerfell in the west, Skyrim north, Morrowind northeast, the Summerset Isles
// southwest, and the Imperial Province in the middle. A location's position is its
// local point scaled into its province's rectangle (`globalPoint`), so a city's
// pixel on the map is its identity — the same two coordinates become the city's
// RNG seed (`cityDataSeeds.citySeed`), which is what makes a named location's city
// the game's own city rather than a generic one.
//
// Climate comes from `TERRAIN.IMG` sampled at the location's global pixel, with
// the original's quirk that a pixel of open sea is replaced by the sample 12
// pixels to its left (which is why four of High Rock's settlements sit on water:
// the game reads the coast behind them).
//
// A note on the terrain classes. The pixel values are 248 (sea) then six land
// classes in three consecutive pairs. Which pair is temperate, which mountain and
// which desert is **reconstructed** from the data, not read from a table: the
// cities of Hammerfell — the game's desert province, with `D*C*` desert city art —
// sample 253/254, and High Rock's sample 249/250, and High Rock is temperate. So
// 249/250 = temperate, 251/252 = mountain, 253/254 = desert, which also matches the
// order the original tests them in. Logged as S16 in PROGRESS.md.

import { parseCityData, questDungeonsOf, locationGlobalPoint, WORLD_MAP_SIZE } from '../arena/cityDataFile.js';
import { citySeed, dungeonSeed, mainQuestDungeonMifName, wildernessSeed } from '../arena/cityDataSeeds.js';
import { dungeonNameFor } from './dungeonNames.js';

/** The terrain pixel that means open sea. */
export const TERRAIN_SEA = 248;

/**
 * Terrain class → climate. See this file's header for how the pairs were fixed.
 * @type {Readonly<Record<number, 'temperate'|'mountain'|'desert'>>}
 */
export const TERRAIN_CLIMATE = Object.freeze({
  249: 'temperate', 250: 'temperate',
  251: 'mountain', 252: 'mountain',
  253: 'desert', 254: 'desert',
});

/** Class → a single character, for the ASCII evidence in `tools/world-dump.mjs`. */
export const TERRAIN_GLYPH = Object.freeze({
  248: '~', 249: '.', 250: ',', 251: '^', 252: 'M', 253: 'd', 254: 'D',
});

/** How far left the original looks when a location's pixel is sea. */
export const SEA_WRAP_PIXELS = 12;

/**
 * The whole world: nine provinces and everything in them.
 */
export class WorldMap {
  /**
   * @param {object} opts
   * @param {Uint8Array} opts.cityData  `CITYDATA.64`'s bytes
   * @param {{width: number, height: number, indices: Uint8Array}} opts.terrain
   */
  constructor(opts) {
    const { cityData, terrain } = opts;
    const parsed = parseCityData(cityData);
    /** @type {object[]} */
    this.provinces = parsed.provinces;
    this.warnings = parsed.warnings;
    this.terrain = terrain;
    this.width = WORLD_MAP_SIZE.width;
    this.height = WORLD_MAP_SIZE.height;

    /** The dungeon names this world has handed out, so no two of them collide. */
    this.dungeonNames = new Set();
    /** Every location, city and dungeon, with its derived identity. @type {object[]} */
    this.locations = [];
    for (const province of this.provinces) {
      for (const location of province.locations) {
        const global = locationGlobalPoint(province, location);
        // **A dungeon's name.** Sixteen of the 144 dungeon records carry one and the other
        // 128 do not (the original names them from tables in `A.EXE` when a quest sends the
        // player there — D11). A place with coordinates, a seed and a map marker needs
        // something to call it: a radiant quest has to name its target, the world map has to
        // label the marker, and the arrival panel has to say where the player is. The name
        // is drawn from the dungeon's own seed by `game/dungeonNames.js`, which documents
        // what it is and what it is not.
        const name = location.name || (location.kind === 'dungeon'
          ? this.uniqueDungeonName(dungeonSeed(location, province.id), province.name,
            province.id * 64 + location.id)
          : '');
        this.locations.push({
          ...location,
          name,
          global,
          latitude: (WORLD_MAP_SIZE.height - global.y) / WORLD_MAP_SIZE.height,
          climate: this.climateAt(global),
          coastal: this.isCoastal(global),
          citySeed: location.kind === 'dungeon' ? null : citySeed(location),
          wildernessSeed: location.kind === 'dungeon' ? null : wildernessSeed(location),
          dungeonSeed: location.kind === 'dungeon' ? dungeonSeed(location, province.id) : null,
          get mif() {
            return location.kind === 'dungeon'
              ? mainQuestDungeonMifName(dungeonSeed(location, province.id))
              : null;
          },
        });
      }
    }
  }

  /**
   * The terrain class at a world pixel, applying the original's sea wrap.
   * @param {{x: number, y: number}} point
   * @returns {number}
   */
  terrainAt(point) {
    const index = (x, y) => {
      const cx = Math.max(0, Math.min(this.width - 1, x));
      const cy = Math.max(0, Math.min(this.height - 1, y));
      return this.terrain.indices[cy * this.width + cx];
    };
    let value = index(point.x, point.y);
    if (value !== TERRAIN_SEA) return value;
    // A pixel of sea is replaced by the pixel 12 to its left, wrapping.
    let x = point.x - SEA_WRAP_PIXELS;
    if (x < 0) x += this.width;
    value = index(x, point.y);
    return value !== TERRAIN_SEA ? value : TERRAIN_SEA;
  }

  /**
   * The climate of a world pixel.
   * @param {{x: number, y: number}} point
   * @returns {'temperate'|'mountain'|'desert'}
   */
  climateAt(point) {
    return TERRAIN_CLIMATE[this.terrainAt(point)] ?? 'temperate';
  }

  /**
   * Whether a location has sea within `radius` pixels — which is how Arena's own
   * `isCoastal` behaves, and why `CITYW*`/`TOWNW*`/`VILLAGW*` skeletons exist at all.
   *
   * @param {{x: number, y: number}} point
   * @param {number} [radius]
   * @returns {boolean}
   */
  isCoastal(point, radius = 4) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = point.x + dx;
        const y = point.y + dy;
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        if (this.terrain.indices[y * this.width + x] === TERRAIN_SEA) return true;
      }
    }
    return false;
  }

  /** The province containing a world pixel, or null for open sea. */
  provinceAt(point) {
    return this.provinces.find((p) => point.x >= p.rect.x && point.y >= p.rect.y
      && point.x < p.rect.x + p.rect.width && point.y < p.rect.y + p.rect.height) ?? null;
  }

  /**
   * A generated dungeon name this world has not used yet.
   *
   * `dungeonNames.dungeonNameFor` is deterministic in the dungeon's own seed, and its
   * vocabulary is small enough that two of the 128 unnamed records can draw the same name
   * (measured: 19 collisions over the install's 128). Two markers on one map with one name
   * is worse than a name that reads a little strange, so a collision re-picks from that
   * dungeon's *own* seed: the same dungeon still gets the same name on every visit — this
   * walks the records in the file's order — and no two places share one.
   *
   * `salt` is the record's own address in the file (`province << 6 | local id`), and it is
   * what makes the retry work at all: two records can share a **seed** — measured, the
   * Imperial Province's dungeons draw the same seed as a Skyrim and a Valenwood one, and
   * re-picking from a shared seed gave those two the same answer twice ("Black Keep",
   * "Elden Gate", each on two markers). Salting by the record's address separates them,
   * and the file's order is fixed, so the names are still the same on every visit.
   *
   * @param {number} seed
   * @param {string} province
   * @param {number} [salt]
   * @returns {string}
   */
  uniqueDungeonName(seed, province, salt = 0) {
    const salted = (extra) => ((seed ^ Math.imul(salt + 1 + extra, 0x9e3779b1)) >>> 0);
    let name = dungeonNameFor(salted(0), province);
    for (let attempt = 1; attempt <= 40 && this.dungeonNames.has(name); attempt++) {
      name = dungeonNameFor(salted(attempt * 977), `${province}#${attempt}`);
    }
    // The last resort is still deterministic (the record's own address) and still unique:
    // two markers with one name is the one outcome this function exists to prevent.
    if (this.dungeonNames.has(name)) name = `${name} (${salt + 1})`;
    this.dungeonNames.add(name);
    return name;
  }

  /** All 288 settlements of the world. */
  settlements() {
    return this.locations.filter((l) => l.kind !== 'dungeon');
  }

  /** A province's settlements. */
  settlementsOf(provinceID) {
    return this.settlements().filter((l) => l.provinceID === provinceID);
  }

  /** A province's two named quest dungeons, staff-piece first. */
  questDungeonsOf(provinceID) {
    const province = this.provinces[provinceID];
    return questDungeonsOf(province).map((d) => this.locations.find((l) => l.provinceID === provinceID && l.id === d.id));
  }

  /** Find a location by name, case-insensitively (the first match). */
  byName(name) {
    const wanted = String(name).toLowerCase();
    return this.locations.find((l) => l.name.toLowerCase() === wanted) ?? null;
  }

  /** All settlements of one kind, for the map's "show me the cities" filters. */
  ofKind(kind) {
    return this.locations.filter((l) => l.kind === kind);
  }

  /**
   * Fast travel between two world pixels.
   *
   * Arena's own travel time walks the straight line between the points and looks
   * up a climate/weather speed table for every pixel — those tables live in
   * `A.EXE`, which this data set does not have (D11). This is the plain-distance
   * version: it keeps the *scale* of an Arena journey (a province hop is days, a
   * continent crossing is weeks) without pretending to the original's numbers.
   * Logged as S18 in PROGRESS.md.
   *
   * @param {{x: number, y: number}} from
   * @param {{x: number, y: number}} to
   * @returns {{days: number, pixels: number}}
   */
  travel(from, to) {
    const pixels = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
    const days = Math.max(1, Math.round(pixels / 22));
    return { days, pixels };
  }
}

/**
 * Load and build the world from an `ArenaData` facade.
 *
 * @param {import('../arena/arenaData.js').ArenaData} data
 * @returns {Promise<WorldMap>}
 */
export async function loadWorldMap(data) {
  const [cityData, terrain] = await Promise.all([
    data.must('CITYDATA.64'),
    data.img('TERRAIN.IMG'),
  ]);
  if (terrain.width !== WORLD_MAP_SIZE.width || terrain.height !== WORLD_MAP_SIZE.height) {
    throw new Error(`TERRAIN.IMG is ${terrain.width}×${terrain.height}; ${WORLD_MAP_SIZE.width}×${WORLD_MAP_SIZE.height} expected`);
  }
  return new WorldMap({ cityData, terrain });
}

