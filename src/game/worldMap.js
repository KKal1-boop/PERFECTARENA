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
// Climate comes from `TERRAIN.IMG` sampled at the location's global pixel. **Two
// readings, both the original's own**, and the first of them was wrong here for a
// long time in a way a player can see at once (D-38):
//
//   1. **Which pixel means which climate.** The image is 320×200 palette indices:
//      248 sea, then six land classes — and the pairs are **not** in the order this
//      file used to assume. Read off `OpenTESArena`'s own constants
//      (`Assets/BinaryAssetLibrary.h`, `WorldMapTerrain`) and its `toClimateType`:
//      **249/250 = mountain, 251/254 = temperate, 252/253 = desert**. The old table
//      here had 249/250 temperate, 251/252 mountain, 253/254 desert — a shift of one
//      pair, which put the **Imperial City in the desert** (it samples 254 = temperate),
//      gave Skyrim a temperate country, and dressed Black Marsh in the wrong tileset.
//      The reasoning that produced it was "Hammerfell is the desert province and its
//      cities sample 253/254, High Rock is temperate and samples 249/250" — and it is
//      the *second* half of that which was false: 249 is `MOUNTAIN1`, and High Rock's
//      settlements are the game's mountain ones.
//   2. **How a pixel is read.** `WorldMapTerrain::getFailSafeAt` does two things: it
//      takes **every** sample twelve pixels to the left (a linear-index shift that
//      wraps around the whole buffer — an error correction, applied whether or not the
//      pixel is sea), and if *that* pixel is still sea it walks the four cardinal
//      directions outward, one distance at a time, below → above → right → left, and
//      takes the first land it finds; if there is none within 199 cells it answers 254
//      (temperate) rather than nothing. This file used to read the pixel at the point
//      itself, shifted left only when it was sea, and answered the sea constant when the
//      shifted pixel was also sea — which is how a coastal location's climate could come
//      back as the one thing it never is.
//
// Sources: `ArenaLocationUtils::getClimateType` (the global point → the fail-safe
// sample → `toClimateType`) in `OpenTESArena/src/WorldMap/ArenaLocationUtils.cpp`;
// `WorldMapTerrain::getFailSafeAt`/`toClimateType` and the `TERRAIN.IMG` index
// constants in `OpenTESArena/src/Assets/BinaryAssetLibrary.{h,cpp}`.
//
// **And the ninth province, which Arena's file leaves empty (D-39, `game/cyrodiil.js`).**
// Eight provinces name all 32 of their settlements; the Imperial Province — the middle of
// Tamriel and the one a new game begins in — names one (the Imperial City) and leaves the
// other 31 records as all-zero placeholders: no name, local (0,0), visibility 0. Read as
// places, those 31 were **one** place: one world pixel (the province rectangle's corner),
// one city seed (0, because `citySeed` is the packed local point), one country (0, because
// `wildernessSeed` is the name's first four letters), an empty string for the map's label
// and the marker card's title, and a `?location=` with nothing in it for fast travel. The
// later games answered the question Arena left open, so this world takes **their** Cyrodiil —
// Anvil and Kvatch on the Gold Coast, Skingrad in the West Weald, Bravil on Niben Bay,
// Leyawiin at the Niben's mouth, Cheydinhal under the Valus Mountains, Bruma below the
// Jerall pass, Chorrol in the Great Forest, and the villages, farms and priories around
// them — through `fillImperialProvince`, which keeps the file's own named record exactly as
// the file has it. `game/cyrodiil.js` carries what is sourced (the names, the kinds, the
// directions) and what is this project's own (the pixel).

import { parseCityData, questDungeonsOf, locationGlobalPoint, WORLD_MAP_SIZE } from '../arena/cityDataFile.js';
import { citySeed, dungeonSeed, mainQuestDungeonMifName, wildernessSeed } from '../arena/cityDataSeeds.js';
import { fillImperialProvince } from './cyrodiil.js';
import { dungeonNameFor } from './dungeonNames.js';
import { styleOf } from './provinceStyle.js';

/** The terrain pixel that means open sea. */
export const TERRAIN_SEA = 248;

/**
 * Terrain class → climate — **the game's own pairs** (`WorldMapTerrain`'s six index
 * constants, `toClimateType`'s three groups). See this file's header: a table that says
 * anything else here puts provinces in the wrong country, visibly, at once.
 *
 * @type {Readonly<Record<number, 'temperate'|'mountain'|'desert'>>}
 */
export const TERRAIN_CLIMATE = Object.freeze({
  249: 'mountain', 250: 'mountain',
  251: 'temperate', 254: 'temperate',
  252: 'desert', 253: 'desert',
});

/** What the original answers when the sea's fail-safe finds no land at all. */
export const TERRAIN_FALLBACK = 254;

/** How far the fail-safe walks before it gives up — `getFailSafeAt`'s own 200. */
export const FAIL_SAFE_REACH = 200;

/** Class → a single character, for the ASCII evidence in `tools/world-dump.mjs`. */
export const TERRAIN_GLYPH = Object.freeze({
  248: '~', 249: '.', 250: ',', 251: '^', 252: 'M', 253: 'd', 254: 'D',
});

/** How far left the original looks when a location's pixel is sea. */
export const SEA_WRAP_PIXELS = 12;

/**
 * Where `TAMRIEL.MNU` stores the 10 packed world-map bitmasks (9 provinces + Exit button),
 * ported from OpenTESArena's `BinaryAssetLibrary::initWorldMapMasks` (`WorldMapMask.{h,cpp}`).
 */
export const WORLD_MAP_MASK_OFFSET = 0x87d5;

/**
 * The bounding rectangles of the 9 province bitmasks inside `TAMRIEL.MNU` (320×200 space).
 * Every pixel in 320×200 belongs to at most one of these 9 masks (0 overlaps across the continent).
 */
export const PROVINCE_MASK_RECTS = Object.freeze([
  Object.freeze({ x: 37, y: 32, width: 86, height: 57 }),
  Object.freeze({ x: 47, y: 53, width: 90, height: 62 }),
  Object.freeze({ x: 113, y: 29, width: 88, height: 53 }),
  Object.freeze({ x: 190, y: 31, width: 102, height: 93 }),
  Object.freeze({ x: 31, y: 131, width: 65, height: 52 }),
  Object.freeze({ x: 100, y: 118, width: 61, height: 55 }),
  Object.freeze({ x: 144, y: 119, width: 50, height: 57 }),
  Object.freeze({ x: 204, y: 116, width: 67, height: 67 }),
  Object.freeze({ x: 103, y: 72, width: 131, height: 84 }),
]);

/**
 * The 65 yellow city-state dots painted onto `TAMRIEL.IMG` (`palette[11] = rgb(255,255,0)`):
 * 8 city-states in each of provinces 0…7 plus the Imperial City in province 8, in `CITYDATA.64`
 * slot order (`city` index 0…7).
 *
 * `CITYDATA.64`'s coarse province rectangles (`rect.y = 22` in Skyrim while the continent map's
 * northern coast begins at `y = 29`) project northern coastal cities like Winterhold (`global`
 * 182,26) into the ocean on `TAMRIEL.IMG`, whereas `TAMRIEL.IMG` itself paints Winterhold's
 * yellow dot at `(179,33)` — matching its dot on `SKYRIM.IMG`. Anchoring each province's
 * continent-map projection to its painted city dots (`tamrielPointOf` below) puts all 65
 * city-states on their exact yellow dot on `TAMRIEL.IMG` and keeps every town, village and
 * dungeon on land inside its province on the continent view, while preserving `location.global`
 * (`CITYDATA.64`'s arithmetic) for `TERRAIN.IMG` sampling and seeds.
 */
export const TAMRIEL_CITY_DOTS = Object.freeze([
  // [0] High Rock: North Point, Daggerfall, Camlorn, Shornhelm, Wayrest, Evermore, Farrun, Jehanna
  Object.freeze([
    Object.freeze({ local: Object.freeze({ x: 175, y: 14 }), dot: Object.freeze({ x: 82, y: 36 }) }),
    Object.freeze({ local: Object.freeze({ x: 9, y: 162 }), dot: Object.freeze({ x: 44, y: 84 }) }),
    Object.freeze({ local: Object.freeze({ x: 43, y: 103 }), dot: Object.freeze({ x: 46, y: 61 }) }),
    Object.freeze({ local: Object.freeze({ x: 133, y: 59 }), dot: Object.freeze({ x: 70, y: 48 }) }),
    Object.freeze({ local: Object.freeze({ x: 146, y: 125 }), dot: Object.freeze({ x: 73, y: 67 }) }),
    Object.freeze({ local: Object.freeze({ x: 218, y: 75 }), dot: Object.freeze({ x: 96, y: 53 }) }),
    Object.freeze({ local: Object.freeze({ x: 261, y: 8 }), dot: Object.freeze({ x: 107, y: 34 }) }),
    Object.freeze({ local: Object.freeze({ x: 312, y: 11 }), dot: Object.freeze({ x: 119, y: 35 }) }),
  ]),
  // [1] Hammerfell: Sentinel, Hegathe, Gilane, Taneth, Rihad, Dragonstar, Elinhir, Skaven
  Object.freeze([
    Object.freeze({ local: Object.freeze({ x: 46, y: 78 }), dot: Object.freeze({ x: 58, y: 80 }) }),
    Object.freeze({ local: Object.freeze({ x: 43, y: 155 }), dot: Object.freeze({ x: 59, y: 98 }) }),
    Object.freeze({ local: Object.freeze({ x: 103, y: 142 }), dot: Object.freeze({ x: 73, y: 97 }) }),
    Object.freeze({ local: Object.freeze({ x: 158, y: 135 }), dot: Object.freeze({ x: 91, y: 95 }) }),
    Object.freeze({ local: Object.freeze({ x: 207, y: 180 }), dot: Object.freeze({ x: 102, y: 107 }) }),
    Object.freeze({ local: Object.freeze({ x: 219, y: 11 }), dot: Object.freeze({ x: 113, y: 59 }) }),
    Object.freeze({ local: Object.freeze({ x: 304, y: 81 }), dot: Object.freeze({ x: 131, y: 81 }) }),
    Object.freeze({ local: Object.freeze({ x: 180, y: 48 }), dot: Object.freeze({ x: 100, y: 67 }) }),
  ]),
  // [2] Skyrim: Solitude, Dawnstar, Winterhold, Snowhawk, Riften, Falcrenth, Whiterun, Windhelm
  Object.freeze([
    Object.freeze({ local: Object.freeze({ x: 112, y: 8 }), dot: Object.freeze({ x: 141, y: 30 }) }),
    Object.freeze({ local: Object.freeze({ x: 186, y: 23 }), dot: Object.freeze({ x: 163, y: 33 }) }),
    Object.freeze({ local: Object.freeze({ x: 244, y: 17 }), dot: Object.freeze({ x: 179, y: 33 }) }),
    Object.freeze({ local: Object.freeze({ x: 75, y: 66 }), dot: Object.freeze({ x: 133, y: 47 }) }),
    Object.freeze({ local: Object.freeze({ x: 301, y: 158 }), dot: Object.freeze({ x: 193, y: 70 }) }),
    Object.freeze({ local: Object.freeze({ x: 103, y: 178 }), dot: Object.freeze({ x: 141, y: 74 }) }),
    Object.freeze({ local: Object.freeze({ x: 187, y: 105 }), dot: Object.freeze({ x: 163, y: 57 }) }),
    Object.freeze({ local: Object.freeze({ x: 282, y: 46 }), dot: Object.freeze({ x: 189, y: 41 }) }),
  ]),
  // [3] Morrowind: Ebonheart, Narsis, Blacklight, Firewatch, Necrom, Mournhold, Tear, Kragenmoor
  Object.freeze([
    Object.freeze({ local: Object.freeze({ x: 149, y: 111 }), dot: Object.freeze({ x: 238, y: 82 }) }),
    Object.freeze({ local: Object.freeze({ x: 154, y: 181 }), dot: Object.freeze({ x: 241, y: 112 }) }),
    Object.freeze({ local: Object.freeze({ x: 56, y: 32 }), dot: Object.freeze({ x: 207, y: 44 }) }),
    Object.freeze({ local: Object.freeze({ x: 186, y: 32 }), dot: Object.freeze({ x: 249, y: 45 }) }),
    Object.freeze({ local: Object.freeze({ x: 281, y: 95 }), dot: Object.freeze({ x: 279, y: 75 }) }),
    Object.freeze({ local: Object.freeze({ x: 210, y: 133 }), dot: Object.freeze({ x: 255, y: 92 }) }),
    Object.freeze({ local: Object.freeze({ x: 247, y: 190 }), dot: Object.freeze({ x: 266, y: 117 }) }),
    Object.freeze({ local: Object.freeze({ x: 83, y: 140 }), dot: Object.freeze({ x: 216, y: 92 }) }),
  ]),
  // [4] Summurset Isle: Dusk, Sunhold, Alinor, Shimmerene, Lillandril, Firsthold, Skywatch, Cloudrest
  Object.freeze([
    Object.freeze({ local: Object.freeze({ x: 218, y: 173 }), dot: Object.freeze({ x: 84, y: 177 }) }),
    Object.freeze({ local: Object.freeze({ x: 151, y: 171 }), dot: Object.freeze({ x: 61, y: 176 }) }),
    Object.freeze({ local: Object.freeze({ x: 77, y: 131 }), dot: Object.freeze({ x: 42, y: 165 }) }),
    Object.freeze({ local: Object.freeze({ x: 186, y: 115 }), dot: Object.freeze({ x: 73, y: 159 }) }),
    Object.freeze({ local: Object.freeze({ x: 62, y: 54 }), dot: Object.freeze({ x: 37, y: 144 }) }),
    Object.freeze({ local: Object.freeze({ x: 193, y: 15 }), dot: Object.freeze({ x: 75, y: 133 }) }),
    Object.freeze({ local: Object.freeze({ x: 252, y: 86 }), dot: Object.freeze({ x: 91, y: 150 }) }),
    Object.freeze({ local: Object.freeze({ x: 155, y: 56 }), dot: Object.freeze({ x: 63, y: 142 }) }),
  ]),
  // [5] Valenwood: Eldenroot, Silvenar, Woodhearth, Falinesti, Greenheart, Arenthia, Haven, Southpoint
  Object.freeze([
    Object.freeze({ local: Object.freeze({ x: 196, y: 98 }), dot: Object.freeze({ x: 135, y: 145 }) }),
    Object.freeze({ local: Object.freeze({ x: 159, y: 59 }), dot: Object.freeze({ x: 129, y: 132 }) }),
    Object.freeze({ local: Object.freeze({ x: 50, y: 116 }), dot: Object.freeze({ x: 104, y: 149 }) }),
    Object.freeze({ local: Object.freeze({ x: 121, y: 41 }), dot: Object.freeze({ x: 120, y: 128 }) }),
    Object.freeze({ local: Object.freeze({ x: 132, y: 144 }), dot: Object.freeze({ x: 123, y: 158 }) }),
    Object.freeze({ local: Object.freeze({ x: 228, y: 9 }), dot: Object.freeze({ x: 141, y: 122 }) }),
    Object.freeze({ local: Object.freeze({ x: 298, y: 170 }), dot: Object.freeze({ x: 157, y: 165 }) }),
    Object.freeze({ local: Object.freeze({ x: 216, y: 171 }), dot: Object.freeze({ x: 140, y: 167 }) }),
  ]),
  // [6] Elsweyr: Corinth, Alabaster, Senchal, Rimmen, Torval, Dune, Orcrest, Riverhold
  Object.freeze([
    Object.freeze({ local: Object.freeze({ x: 144, y: 113 }), dot: Object.freeze({ x: 165, y: 154 }) }),
    Object.freeze({ local: Object.freeze({ x: 266, y: 97 }), dot: Object.freeze({ x: 189, y: 147 }) }),
    Object.freeze({ local: Object.freeze({ x: 275, y: 188 }), dot: Object.freeze({ x: 190, y: 171 }) }),
    Object.freeze({ local: Object.freeze({ x: 252, y: 43 }), dot: Object.freeze({ x: 186, y: 138 }) }),
    Object.freeze({ local: Object.freeze({ x: 97, y: 153 }), dot: Object.freeze({ x: 163, y: 165 }) }),
    Object.freeze({ local: Object.freeze({ x: 37, y: 24 }), dot: Object.freeze({ x: 146, y: 126 }) }),
    Object.freeze({ local: Object.freeze({ x: 130, y: 41 }), dot: Object.freeze({ x: 168, y: 136 }) }),
    Object.freeze({ local: Object.freeze({ x: 120, y: 10 }), dot: Object.freeze({ x: 164, y: 124 }) }),
  ]),
  // [7] Black Marsh: Stormhold, Thorn, Helstrom, Gideon, Soulrest, Blackrose, Lilmoth, Archon
  Object.freeze([
    Object.freeze({ local: Object.freeze({ x: 124, y: 25 }), dot: Object.freeze({ x: 230, y: 132 }) }),
    Object.freeze({ local: Object.freeze({ x: 248, y: 21 }), dot: Object.freeze({ x: 259, y: 123 }) }),
    Object.freeze({ local: Object.freeze({ x: 138, y: 66 }), dot: Object.freeze({ x: 234, y: 139 }) }),
    Object.freeze({ local: Object.freeze({ x: 40, y: 99 }), dot: Object.freeze({ x: 212, y: 152 }) }),
    Object.freeze({ local: Object.freeze({ x: 44, y: 157 }), dot: Object.freeze({ x: 213, y: 174 }) }),
    Object.freeze({ local: Object.freeze({ x: 147, y: 142 }), dot: Object.freeze({ x: 232, y: 165 }) }),
    Object.freeze({ local: Object.freeze({ x: 183, y: 181 }), dot: Object.freeze({ x: 242, y: 176 }) }),
    Object.freeze({ local: Object.freeze({ x: 248, y: 130 }), dot: Object.freeze({ x: 260, y: 160 }) }),
  ]),
  // [8] Imperial Province: Imperial City
  Object.freeze([
    Object.freeze({ local: Object.freeze({ x: 180, y: 65 }), dot: Object.freeze({ x: 175, y: 99 }) }),
  ]),
]);

/**
 * Project a province-local point `(0…319, 0…199)` onto `TAMRIEL.IMG` (320×200) so that:
 *   1. Every one of the 65 original city-states lands on its exact painted yellow dot (`TAMRIEL_CITY_DOTS`).
 *   2. Every town, village, dungeon and wilderness point in that province is projected through
 *      the province's `PROVINCE_MASK_RECTS` plus inverse-distance-weighted residual from the
 *      province's city dots, and clamped inside the province's mask when masks are available.
 *
 * @param {number} provinceID
 * @param {{x: number, y: number}} local
 * @param {{masks?: ReadonlyArray<any>|null, image?: object|null}} [opts]
 * @returns {{x: number, y: number}}
 */
export function tamrielPointOf(provinceID, local, opts = {}) {
  const mRect = PROVINCE_MASK_RECTS[provinceID];
  if (!mRect || !local) return { x: Math.round(local?.x ?? 0), y: Math.round(local?.y ?? 0) };
  const baseX = Math.floor((local.x * Math.floor((mRect.width * 100) / WORLD_MAP_SIZE.width)) / 100) + mRect.x;
  const baseY = Math.floor((local.y * Math.floor((mRect.height * 100) / WORLD_MAP_SIZE.height)) / 100) + mRect.y;
  const anchors = TAMRIEL_CITY_DOTS[provinceID] ?? [];
  let wx = 0;
  let wy = 0;
  let wSum = 0;
  for (const a of anchors) {
    const d2 = (local.x - a.local.x) ** 2 + (local.y - a.local.y) ** 2;
    if (d2 === 0) return { x: a.dot.x, y: a.dot.y };
    const aBaseX = Math.floor((a.local.x * Math.floor((mRect.width * 100) / WORLD_MAP_SIZE.width)) / 100) + mRect.x;
    const aBaseY = Math.floor((a.local.y * Math.floor((mRect.height * 100) / WORLD_MAP_SIZE.height)) / 100) + mRect.y;
    const w = 1 / (d2 + 100);
    wx += w * (a.dot.x - aBaseX);
    wy += w * (a.dot.y - aBaseY);
    wSum += w;
  }
  let x = Math.round(baseX + (wSum ? wx / wSum : 0));
  let y = Math.round(baseY + (wSum ? wy / wSum : 0));
  const mask = opts.masks?.[provinceID] ?? null;
  const onLand = (px, py) => {
    if (mask && !mask.get(px, py)) return false;
    if (!opts.image) return true;
    const index = opts.image.indices[py * WORLD_MAP_SIZE.width + px];
    const rgb = opts.image.palette.rgb;
    const r = rgb[index * 3], g = rgb[index * 3 + 1], b = rgb[index * 3 + 2];
    // The hand-drawn sea and rivers are blue; mask polygons also include coastal water.
    return !(b > r + 15 && b > g + 10);
  };
  if (!onLand(x, y)) {
    let best = null;
    for (let r = 1; r <= Math.max(mRect.width, mRect.height); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (nx < mRect.x || ny < mRect.y || nx >= mRect.x + mRect.width || ny >= mRect.y + mRect.height) continue;
          if (onLand(nx, ny)) {
            const dist = dx * dx + dy * dy;
            if (!best || dist < best.dist) best = { x: nx, y: ny, dist };
          }
        }
      }
      if (best && (r + 1) ** 2 > best.dist) break;
    }
    if (best) { x = best.x; y = best.y; }
  }
  return { x, y };
}

/**
 * Decode the 9 province polygon bitmasks from `TAMRIEL.MNU`.
 *
 * @param {Uint8Array|null|undefined} mnuBytes
 * @returns {ReadonlyArray<{id: number, rect: {x: number, y: number, width: number, height: number}, bytesPerRow: number, data: Uint8Array, get: (x: number, y: number) => boolean}>|null}
 */
export function parseWorldMapMasks(mnuBytes) {
  if (!mnuBytes || mnuBytes.length <= WORLD_MAP_MASK_OFFSET) return null;
  let offset = WORLD_MAP_MASK_OFFSET;
  const out = [];
  for (let id = 0; id < PROVINCE_MASK_RECTS.length; id++) {
    const rect = PROVINCE_MASK_RECTS[id];
    const bytesPerRow = Math.ceil(rect.width / 8);
    const byteCount = bytesPerRow * rect.height;
    if (offset + byteCount > mnuBytes.length) return null;
    const data = mnuBytes.subarray(offset, offset + byteCount);
    offset += byteCount;
    out.push(Object.freeze({
      id,
      rect,
      bytesPerRow,
      data,
      get(x, y) {
        const px = Math.floor(x);
        const py = Math.floor(y);
        if (px < rect.x || py < rect.y || px >= rect.x + rect.width || py >= rect.y + rect.height) {
          return false;
        }
        const rx = px - rect.x;
        const ry = py - rect.y;
        const byteIndex = Math.floor(rx / 8) + ry * bytesPerRow;
        const bitIndex = 7 - (rx % 8);
        return (data[byteIndex] & (1 << bitIndex)) !== 0;
      },
    }));
  }
  return Object.freeze(out);
}

/**
 * The whole world: nine provinces and everything in them.
 */
export class WorldMap {
  /**
   * @param {object} opts
   * @param {Uint8Array} opts.cityData  `CITYDATA.64`'s bytes
   * @param {{width: number, height: number, indices: Uint8Array}} opts.terrain
   * @param {Uint8Array|null} [opts.tamrielMnu]  optional `TAMRIEL.MNU` bytes for exact province masks
   * @param {object|null} [opts.tamrielImage] original art for coastline-aware marker projection
   */
  constructor(opts) {
    const { cityData, terrain, tamrielMnu = null, tamrielImage = null } = opts;
    const parsed = parseCityData(cityData);
    // The Imperial Province's 31 placeholder records become Cyrodiil's places here, before
    // any of them is given a pixel, a seed, a climate or a name (D-39). Everything below
    // reads `this.provinces`, so nothing downstream can see a nameless settlement.
    const filled = fillImperialProvince(parsed.provinces);
    /** @type {object[]} */
    this.provinces = filled.provinces;
    /** Exact province polygon masks from `TAMRIEL.MNU`, when available. */
    this.masks = parseWorldMapMasks(tamrielMnu);
    this.mapImage = tamrielImage;
    /** How many placeholder records the later lore gave a place to (31 in the released file). */
    this.placed = filled.filled;
    this.warnings = [...parsed.warnings, ...filled.warnings];
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
        // The pixel's own class (D-38) and the **two climates a place actually has**: the ground it
        // stands on (country, creatures, sky) and the architecture its settlement is built from
        // (`TC*`/`MC*`/`DC*`). `game/provinceStyle.js` is the law of the second pair; a place it says
        // nothing about gets the pixel's class for both, which is the game's own answer.
        const terrainClimate = this.climateAt(global);
        const style = styleOf({ provinceID: province.id, name, terrainClimate, global });
        const tamriel = this.mapPoint(province.id, location.local);
        this.locations.push({
          ...location,
          name,
          global,
          tamriel,
          latitude: (WORLD_MAP_SIZE.height - global.y) / WORLD_MAP_SIZE.height,
          terrainClimate,
          climate: style.ground,
          architecture: style.architecture ?? style.ground,
          settlementTreeClimate: style.settlementTreeClimate,
          weather: style.weather,
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
    // A location's raw CITYDATA `global` remains source data, never gameplay space.
    // Reserve the original city dots first; rounding/clamping must not merge places.
    const occupied = new Set();
    const ordered = [...this.locations].sort((a, b) =>
      Number(b.kind === 'city' && !b.placed) - Number(a.kind === 'city' && !a.placed));
    for (const location of this.masks && this.mapImage ? ordered : []) {
      const point = location.tamriel;
      let best = null;
      for (let radius = 0; radius < 320 && !best; radius++) {
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = point.x + dx, y = point.y + dy;
          if (occupied.has(`${x},${y}`) || !this.landAt({ x, y }, location.provinceID)) continue;
          const distance = dx * dx + dy * dy;
          if (!best || distance < best.distance) best = { x, y, distance };
        }
      }
      if (best) location.tamriel = { x: best.x, y: best.y };
      occupied.add(`${location.tamriel.x},${location.tamriel.y}`);
    }
    this.locationPoints = new Map(this.locations.map((l) => [`${l.provinceID}:${l.local.x},${l.local.y}`, l]));
    this.inverseMaps = new Map();
    this.worldTerrain = { ...terrain, indices: new Uint8Array(terrain.indices) };
    if (this.masks && this.mapImage) for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const point = { x, y };
      const province = this.provinceAt(point);
      const local = province && this.localPointAt(point, province.id);
      this.worldTerrain.indices[y * this.width + x] = !this.landAt(point) ? TERRAIN_SEA
        : this.terrainAt(local ? locationGlobalPoint(province, { local }) : point);
    }
  }

  /** Land/coastline in the painted map, shared by walkers and map inspection. */
  landAt(point, provinceID = null) {
    const x = Math.floor(point.x), y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    if (!this.masks || !this.mapImage) return this.terrain.indices[y * this.width + x] !== TERRAIN_SEA;
    const province = this.provinceAt({ x, y });
    if (!province || (provinceID != null && province.id !== provinceID)) return false;
    const i = this.mapImage.indices[y * this.width + x] * 3;
    const rgb = this.mapImage.palette.rgb;
    return !(rgb[i + 2] > rgb[i] + 15 && rgb[i + 2] > rgb[i + 1] + 10);
  }

  worldClimateAt(point) {
    const index = this.worldTerrain.indices[Math.floor(point.y) * this.width + Math.floor(point.x)];
    return TERRAIN_CLIMATE[index] ?? 'temperate';
  }

  /** Province-map pixels → painted continent pixels (never used to change RNG seeds). */
  mapPoint(provinceID, local) {
    const exact = this.locationPoints?.get(`${provinceID}:${local.x},${local.y}`);
    if (exact) return { ...exact.tamriel };
    return tamrielPointOf(provinceID, local, { masks: this.masks, image: this.mapImage });
  }

  /** Invert the art projection by nearest pixel, for map inspection and dev teleport. */
  localPointAt(point, provinceID) {
    if (!this.provinces[provinceID]) return null;
    let inverse = this.inverseMaps.get(provinceID);
    if (!inverse) {
      // Splat a four-local-pixel lattice, then flood the remaining art pixels.
      // Bounded once per province, not 64,000 projections on every HUD frame.
      inverse = new Int32Array(this.width * this.height).fill(-1);
      const queue = [];
      const put = (point, local, replace = false) => {
        const x = Math.round(point.x), y = Math.round(point.y);
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
        const index = y * this.width + x;
        if (inverse[index] < 0) queue.push(index);
        else if (!replace) return;
        inverse[index] = local.y * this.width + local.x;
      };
      for (let y = 0; y < this.height; y += 4) for (let x = 0; x < this.width; x += 4) {
        put(this.mapPoint(provinceID, { x, y }), { x, y });
      }
      for (const location of this.locations.filter((l) => l.provinceID === provinceID)) put(location.tamriel, location.local, true);
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head], x = index % this.width, y = Math.floor(index / this.width);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, next = ny * this.width + nx;
          if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height || inverse[next] >= 0) continue;
          inverse[next] = inverse[index]; queue.push(next);
        }
      }
      this.inverseMaps.set(provinceID, inverse);
    }
    const x = Math.max(0, Math.min(this.width - 1, Math.round(point.x)));
    const y = Math.max(0, Math.min(this.height - 1, Math.round(point.y)));
    const value = inverse[y * this.width + x];
    return value < 0 ? null : { x: value % this.width, y: Math.floor(value / this.width) };
  }

  /**
   * The terrain class at a world pixel — `WorldMapTerrain::getFailSafeAt`, exactly.
   *
   * Two rules, and both are the original's (this file's header says what the wrong
   * version of them cost): every sample is the pixel **twelve to the left** of the one
   * asked for, as a *linear index* shift that wraps around the whole 320×200 buffer; and
   * a sample that is still sea walks the four cardinal directions outward — below,
   * above, right, left, at each distance in turn — taking the first land it finds, or
   * `TERRAIN_FALLBACK` (254, temperate) when 199 cells of search find none.
   *
   * @param {{x: number, y: number}} point
   * @returns {number}
   */
  terrainAt(point) {
    const count = this.width * this.height;
    // `getFailSafeAt`'s own sampler: x + y·width − 12, wrapped into the buffer.
    const sampled = (x, y) => {
      let i = x + y * this.width - SEA_WRAP_PIXELS;
      if (i < 0) i += count;
      else if (i >= count) i -= count;
      return this.terrain.indices[i];
    };
    const here = sampled(point.x, point.y);
    if (here !== TERRAIN_SEA) return here;
    for (let distance = 1; distance < FAIL_SAFE_REACH; distance++) {
      // Below, above, right, left — the order the original tests them in.
      for (const [x, y] of [[point.x, point.y + distance], [point.x, point.y - distance],
        [point.x + distance, point.y], [point.x - distance, point.y]]) {
        const value = sampled(x, y);
        if (value !== TERRAIN_SEA) return value;
      }
    }
    return TERRAIN_FALLBACK;
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

  /**
   * The province containing a world pixel, or null for open sea.
   *
   * This API accepts painted TAMRIEL map coordinates. When present, the original
   * bitmasks are authoritative, including their sea holes. Without masks it falls
   * back to the deterministic CITYDATA partition. World-grid callers must instead
   * use provinceAtWorld because the two rasters are not registered to one another.
   */
  provinceAt(point) {
    if (!point) return null;
    const px = Math.floor(point.x);
    const py = Math.floor(point.y);
    if (this.masks) {
      for (const mask of this.masks) {
        if (mask.get(px, py)) return this.provinces[mask.id] ?? null;
      }
      return null;
    }
    return this.legacyProvinceAt(point);
  }

  /** Gameplay now uses the painted continent's exact province masks too. */
  provinceAtWorld(point) { return this.provinceAt(point); }

  /** Pre-registration coordinates, used only to migrate old wilderness saves. */
  legacyProvinceAt(point) {
    if (!point) return null;
    const px = Math.floor(point.x), py = Math.floor(point.y);
    const exact = this.locations?.find((l) => l.global.x === px && l.global.y === py);
    if (exact) return this.provinces[exact.provinceID] ?? null;
    const candidates = this.provinces.filter((p) => point.x >= p.rect.x && point.y >= p.rect.y
      && point.x < p.rect.x + p.rect.width && point.y < p.rect.y + p.rect.height);
    if (candidates.length <= 1) return candidates[0] ?? null;
    const exactLoc = this.locations?.find((l) => l.global.x === px && l.global.y === py);
    if (exactLoc) {
      const owner = candidates.find((p) => p.id === exactLoc.provinceID);
      if (owner) return owner;
    }
    let best = candidates[0];
    let bestScore = Infinity;
    for (const p of candidates) {
      const cx = p.rect.x + p.rect.width / 2;
      const cy = p.rect.y + p.rect.height / 2;
      const dx = (point.x - cx) / Math.max(1, p.rect.width / 2);
      const dy = (point.y - cy) / Math.max(1, p.rect.height / 2);
      const score = dx * dx + dy * dy;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
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

  /**
   * All 288 settlements of the world — 32 in each of the nine provinces, the Imperial
   * Province's own 32 included once `fillImperialProvince` has placed them. Every one of
   * them has a name and a pixel of its own; a nameless record is not a settlement.
   */
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
  byName(name, provinceID = null) {
    const wanted = String(name).toLowerCase();
    return this.locations.find((l) => l.name.toLowerCase() === wanted
      && (provinceID == null || l.provinceID === Number(provinceID))) ?? null;
  }

  byId(provinceID, id) {
    return this.locations.find((l) => l.provinceID === Number(provinceID) && l.id === Number(id)) ?? null;
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
  if (typeof data.cached === 'function') return data.cached('model:worldMap:v2', () => readWorldMap(data));
  return readWorldMap(data);
}

async function readWorldMap(data) {
  const [cityData, terrain, tamrielMnu, tamrielImage] = await Promise.all([
    data.must('CITYDATA.64'),
    data.img('TERRAIN.IMG'),
    typeof data.bytes === 'function' ? data.bytes('TAMRIEL.MNU').catch(() => null) : Promise.resolve(null),
    data.img('TAMRIEL.IMG').catch(() => null),
  ]);
  if (terrain.width !== WORLD_MAP_SIZE.width || terrain.height !== WORLD_MAP_SIZE.height) {
    throw new Error(`TERRAIN.IMG is ${terrain.width}×${terrain.height}; ${WORLD_MAP_SIZE.width}×${WORLD_MAP_SIZE.height} expected`);
  }
  return new WorldMap({ cityData, terrain, tamrielMnu, tamrielImage });
}

