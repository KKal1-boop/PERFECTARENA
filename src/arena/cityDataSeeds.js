// ARENA'S LOCATION SEEDS (**VERIFIED**, transcribed from the original's arithmetic).
//
// A location's identity in Arena is a handful of 32-bit numbers derived from its
// coordinates and its name. They are what make `Daggerfall`'s city *Daggerfall's*
// city and not an arbitrary town: the city seed is fed straight into the city
// generator's RNG (`game/cityPlan.js`), and the dungeon seed is turned into the
// `.MIF` filename the map-dungeon loader then reads (`39300577.MIF` and friends —
// which is what that naming scheme turned out to be, resolving the open question
// in FORMATS.md §2).
//
// Everything here is pure arithmetic over parsed `CITYDATA` records, so it can be
// tested against the file directly. Sources are credited at the bottom of
// FORMATS.md.

import { globalPoint } from './cityDataFile.js';

/** 32-bit left rotate, the `Bytes::rol` of the original. */
export function rotateLeft(value, bits) {
  const v = value >>> 0;
  return ((v << bits) | (v >>> (32 - bits))) >>> 0;
}

/**
 * The city seed: the location's own local coordinates, packed.
 *
 * This is why a city's block layout is different for every town in the game and
 * identical every time you visit one.
 *
 * @param {{local: {x: number, y: number}}} location
 * @returns {number}
 */
export function citySeed(location) {
  return ((location.local.x << 16) + location.local.y) >>> 0;
}

/**
 * The wilderness seed: the first four letters of the location's name, read as a
 * little-endian `uint32`.
 *
 * @param {{name: string}} location
 * @returns {number}
 */
export function wildernessSeed(location) {
  const name = location.name ?? '';
  if (name.length < 4) return 0;
  let seed = 0;
  for (let i = 0; i < 4; i++) seed |= (name.charCodeAt(i) & 0xff) << (i * 8);
  return seed >>> 0;
}

/**
 * The province seed: the province's global point times its index.
 * @param {number} provinceID
 * @param {{x: number, y: number}} rect
 */
export function provinceSeed(provinceID, rect) {
  return ((((rect.x << 16) + rect.y) * provinceID) >>> 0);
}

/** The packed global point both the ruler and sky seeds start from. */
function globalPacked(rect, local) {
  const point = globalPoint(local, rect);
  return ((point.x << 16) + point.y) >>> 0;
}

/**
 * The ruler seed: the location's global point, rotated by 16. Bit 0 decides
 * whether the province's ruler is male.
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {{x: number, y: number}} local
 */
export function rulerSeed(rect, local) {
  return rotateLeft(globalPacked(rect, local), 16);
}

/** @param {{x: number, y: number, width: number, height: number}} rect @param {{x: number, y: number}} local @param {number} provinceID */
export function skySeed(rect, local, provinceID) {
  return (globalPacked(rect, local) * provinceID) >>> 0;
}

/** Whether the province's ruler is male. */
export function rulerIsMale(rect, local) {
  return (rulerSeed(rect, local) & 0x3) !== 0;
}

/**
 * A dungeon's seed: NOT its local point. Note the `+ provinceID` and the
 * complement — the original reads `dungeon.y << 16` and `dungeon.x` (swapped
 * relative to a city's), then complements the rotated value.
 *
 * @param {{local: {x: number, y: number}}} dungeon
 * @param {number} provinceID
 */
export function dungeonSeed(dungeon, provinceID) {
  const seed = ((dungeon.local.y << 16) + dungeon.local.x + provinceID) >>> 0;
  return (~rotateLeft(seed, 5)) >>> 0;
}

/**
 * The `.MIF` a main-quest (or randomly named) dungeon loads: the first eight
 * digits of the seed's decimal representation, plus `.MIF`.
 *
 * The loose files in an Arena folder — `39300577.MIF`, `39950681.MIF`, … — are
 * exactly this, which is why they have no meaningful names: each one belongs to a
 * dungeon *seed*, not to a place.
 *
 * @param {number} seed
 * @returns {string}
 */
export function mainQuestDungeonMifName(seed) {
  return `${String(seed).slice(0, 8)}.MIF`;
}

/**
 * How many skeleton templates a settlement of this kind chooses from. Coastal
 * settlements have fewer, which is why the archive holds 5 `CITY*` maps but only
 * 3 `CITYW*`.
 *
 * @param {boolean} coastal
 * @param {boolean} isCityState
 */
export function cityTemplateCount(coastal, isCityState) {
  return coastal ? (isCityState ? 3 : 2) : 5;
}

/**
 * Which template a settlement uses: the index into
 * `tables/cityBlocks.js`'s template list, keyed by kind and coast.
 *
 * @param {'city'|'town'|'village'} kind
 * @param {boolean} coastal
 * @returns {number} 0..5
 */
export function cityTemplateNameIndex(kind, coastal) {
  if (kind === 'city') return coastal ? 5 : 4;
  if (kind === 'town') return coastal ? 1 : 0;
  if (kind === 'village') return coastal ? 3 : 2;
  throw new Error(`unknown settlement kind "${kind}"`);
}

/**
 * The `1 + (globalCityID % count)` variant index a settlement's skeleton uses,
 * where `globalCityID` is the location's id within its province.
 *
 * @param {{kind: 'city'|'town'|'village', index: number, provinceID: number}} location
 * @param {boolean} coastal
 */
export function cityTemplateVariant(location, coastal) {
  const globalCityID = (location.provinceID << 5) + location.index;
  return 1 + (globalCityID % cityTemplateCount(coastal, location.kind === 'city'));
}

/** The location's id in the original's global numbering (`province << 5 | local`). */
export function globalCityID(location) {
  return (location.provinceID << 5) + location.index;
}
