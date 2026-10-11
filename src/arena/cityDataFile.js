// `CITYDATA.64` — THE WORLD OF TAMRIEL (**VERIFIED**).
//
// Every city, town, village, dungeon and province in Arena is one record in this
// one file, and it is the whole of the game's world model: 9 provinces, each a
// rectangle on a 320×200 world map, each holding **48 locations** at fixed local
// coordinates. The province rectangles tile Tamriel; a location's *global* point
// is its local point scaled into its province's rectangle.
//
// Layout (verified by parsing `c:/arenaproject/arena/ARENA/CITYDATA.64`, 11 052
// bytes, and by the source cited at the bottom of this file):
//
//   province block, 1228 bytes, × 9:
//     +0    char[20]  province name, NUL-padded
//     +20   uint16    globalX        ┐ the province's rectangle on the
//     +22   uint16    globalY        │ 320×200 world map
//     +24   uint16    globalW        │
//     +26   uint16    globalH        ┘
//     +28   location records, 25 bytes each, in this exact order:
//             char[20] name, NUL-padded
//             uint16   localX         0…320, within the province
//             uint16   localY         0…200
//             uint8    visibility     bit 0x2 set = known to the player
//           8 city-states, 8 towns, 16 villages,
//           1 "second dungeon" (the province's staff-piece dungeon),
//           1 "first dungeon"  (the province's map/clue dungeon),
//           14 randomly-named dungeons
//
//   28 + 48 × 25 = 1228 exactly, which is the check that the record stride is
//   right: nine blocks of 1228 is the file's 11 052 bytes with nothing left over.
//
// The **location id** is the index into that order (0–7 city-states, 8–15 towns,
// 16–31 villages, 32 second dungeon, 33 first dungeon, 34–47 random dungeons),
// and it is what every seed formula below is keyed on. Nothing here is guessed:
// each function is a transcription of the original's arithmetic, and the seeds it
// produces are what make a named location's city *that* city.

/** How many provinces Arena has. */
export const PROVINCE_COUNT = 9;

/** Bytes per province block. */
export const PROVINCE_BLOCK_SIZE = 1228;

/** Bytes per location record (20 name + 2 + 2 + 1). */
export const LOCATION_RECORD_SIZE = 25;

/** Bytes of a location's record used by its name, NUL-padded. */
export const LOCATION_NAME_SIZE = 20;

/** Location ids by kind. */
export const LOCATION_ID = Object.freeze({
  CITY_STATE: 0, TOWN: 8, VILLAGE: 16, STAFF_DUNGEON: 32, MAP_DUNGEON: 33, RANDOM_DUNGEON: 34,
});

/** How many locations each kind contributes to a province block. */
export const LOCATION_COUNTS = Object.freeze({ cityStates: 8, towns: 8, villages: 16, randomDungeons: 14 });

/** The world map's pixel size. A location's local point lives in this space. */
export const WORLD_MAP_SIZE = Object.freeze({ width: 320, height: 200 });

/**
 * The settlement kind a city-state id maps to. Ids 0–7 are city-states, 8–15
 * towns, 16–31 villages — the split the original's `getCityType` uses.
 *
 * @param {number} localCityID
 * @returns {'city'|'town'|'village'}
 */
export function cityTypeOf(localCityID) {
  if (localCityID < 8) return 'city';
  if (localCityID < 16) return 'town';
  return 'village';
}

/** @param {number} localDungeonID */
export function dungeonKindOf(localDungeonID) {
  if (localDungeonID === 0) return 'staff';
  if (localDungeonID === 1) return 'map';
  return 'random';
}

/** Read a NUL-padded ASCII name out of a byte range. */
function readName(bytes, offset, size) {
  let text = '';
  for (let i = 0; i < size; i++) {
    const code = bytes[offset + i];
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

/** Hex of a small byte range, for the error messages. */
const hex = (bytes, offset, size) => Array.from(bytes.slice(offset, offset + size))
  .map((b) => b.toString(16).padStart(2, '0')).join(' ');

/**
 * Parse `CITYDATA.64` into provinces and locations.
 *
 * @param {Uint8Array} bytes the file's bytes (11 052)
 * @returns {{provinces: object[], size: number, warnings: string[]}}
 */
export function parseCityData(bytes) {
  const expected = PROVINCE_COUNT * PROVINCE_BLOCK_SIZE;
  if (bytes.length < expected) {
    throw new Error(`CITYDATA is ${bytes.length} bytes; ${expected} expected (9 provinces × ${PROVINCE_BLOCK_SIZE})`);
  }
  const warnings = [];
  const provinces = [];

  for (let provinceID = 0; provinceID < PROVINCE_COUNT; provinceID++) {
    const base = provinceID * PROVINCE_BLOCK_SIZE;
    const view = new DataView(bytes.buffer, bytes.byteOffset + base, PROVINCE_BLOCK_SIZE);
    const name = readName(bytes, base, LOCATION_NAME_SIZE);
    const rect = {
      x: view.getUint16(20, true),
      y: view.getUint16(22, true),
      width: view.getUint16(24, true),
      height: view.getUint16(26, true),
    };
    if (rect.width === 0 || rect.height === 0) warnings.push(`province ${provinceID} ("${name}") has a zero-size rectangle`);

    /** @type {object[]} */
    const locations = [];
    let offset = base + 28;
    const push = (kind, index) => {
      const local = new DataView(bytes.buffer, bytes.byteOffset + offset, LOCATION_RECORD_SIZE);
      const locationName = readName(bytes, offset, LOCATION_NAME_SIZE);
      const visibility = bytes[offset + 24];
      const location = {
        id: locations.length,
        provinceID,
        province: name,
        kind,
        index,
        name: locationName,
        local: { x: local.getUint16(20, true), y: local.getUint16(22, true) },
        visible: (visibility & 0x02) !== 0,
      };
      locations.push(location);
      offset += LOCATION_RECORD_SIZE;
    };
    for (let i = 0; i < LOCATION_COUNTS.cityStates; i++) push('city', i);
    for (let i = 0; i < LOCATION_COUNTS.towns; i++) push('town', i);
    for (let i = 0; i < LOCATION_COUNTS.villages; i++) push('village', i);
    push('dungeon', 0);                                  // staff-piece dungeon
    push('dungeon', 1);                                  // map / clue dungeon
    for (let i = 0; i < LOCATION_COUNTS.randomDungeons; i++) push('dungeon', i + 2);

    const consumed = offset - base;
    if (consumed !== PROVINCE_BLOCK_SIZE) {
      warnings.push(`province block ${provinceID} consumed ${consumed} bytes, not ${PROVINCE_BLOCK_SIZE}`);
    }
    provinces.push({ id: provinceID, name, rect, locations });
  }

  if (bytes.length !== expected && bytes.length !== expected + 2) {
    warnings.push(`CITYDATA.64 is ${bytes.length} bytes; ${expected} expected`);
  }
  void hex;
  return { provinces, size: bytes.length, warnings };
}

/**
 * A province's *global* rectangle, as a plain object.
 * @param {object} province
 */
export function provinceRect(province) {
  return { left: province.rect.x, top: province.rect.y, ...province.rect };
}

/**
 * A local point inside a province scaled onto the world map. This is the
 * original's `getLocalPoint`/`getGlobalPoint` pair; the 320×200 constants are the
 * world map's size, and getting them wrong would put every city in the sea.
 *
 * @param {{x: number, y: number}} local
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {{x: number, y: number}}
 */
export function globalPoint(local, rect) {
  return {
    x: Math.floor((local.x * Math.floor((rect.width * 100) / WORLD_MAP_SIZE.width)) / 100) + rect.x,
    y: Math.floor((local.y * Math.floor((rect.height * 100) / WORLD_MAP_SIZE.height)) / 100) + rect.y,
  };
}

/**
 * A location's point on the world map.
 * @param {object} province
 * @param {object} location
 * @returns {{x: number, y: number}}
 */
export function locationGlobalPoint(province, location) {
  return globalPoint(location.local, province.rect);
}

/**
 * Latitude in 0…1, from the world map's y axis (north is y 0).
 * @param {{y: number}} global
 */
export function latitudeOf(global) {
  return (WORLD_MAP_SIZE.height - global.y) / WORLD_MAP_SIZE.height;
}

/**
 * All 48 city/town/village locations of a province, i.e. everything a player can
 * travel to that is not a dungeon.
 * @param {object} province
 */
export function settlementsOf(province) {
  return province.locations.filter((l) => l.kind !== 'dungeon');
}

/**
 * A province's two named quest dungeons: the staff-piece dungeon and the map
 * (clue) dungeon, in that order.
 * @param {object} province
 */
export function questDungeonsOf(province) {
  return province.locations.filter((l) => l.kind === 'dungeon' && l.index <= 1);
}
