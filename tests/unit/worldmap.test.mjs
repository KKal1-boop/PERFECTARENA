// THE WORLD OF TAMRIEL, WHERE EACH PLACE IS AND WHAT COUNTRY IT IS IN (**block B16**;
// defects D-38 and D-39).
//
// Two laws live in this file, both of them found by measuring the install rather than by
// reading this project's own code.
//
// **D-38 — the climate was one pair over.** The owner played the port beside the real Arena
// and said what any player would say first: *"the biomes, biome backgrounds and buildings
// texture and architecture are completely different … they seem to be swapped like
// blackmarsh has nord architecture the imperial city is in the desert instead of
// temperate"*. `game/worldMap.js`'s terrain-class table was a shift of the game's own:
// 249/250 is `MOUNTAIN`, 251/254 `TEMPERATE`, 252/253 `DESERT` (OpenTESArena's
// `WorldMapTerrain` constants and `toClimateType`), where this project had 249/250
// temperate, 251/252 mountain, 253/254 desert. Every settlement's climate — and through it
// the city `.INF` it is textured from, its wilderness `.INF`, its creatures and its sky —
// came from that table.
//
// **D-39 — the province the game begins in had no places in it.** `CITYDATA.64` names all
// 32 settlements of eight provinces and **one** of the Imperial Province's; the other 31
// records are all-zero placeholders, which the port read as 31 settlements stacked on one
// pixel at the province's own corner, with one city seed (0), one wilderness seed (0), an
// empty name on the map and a `?location=` with nothing in it. `game/cyrodiil.js` fills them
// from the later games' Cyrodiil, and the Imperial City keeps the file's own record.
//
// The province readings below are corroborated from outside this project entirely, which is
// why the shipped table is the one it is: UESP describes High Rock as *"warmer forests in the
// southwest around Daggerfall"* and this world has exactly **two** temperate settlements in
// High Rock — Daggerfall and Reich Gradkeep — and thirty mountain; UESP puts Valenwood's
// mountains *"in the north around Arenthia"*, and this world's three mountain settlements
// there are **Arenthia, Thormar Keep and Ebon Ro**; and UESP's Arena:Elsweyr says the
// province is *"completely devoid of desert biome"*, which the game's own classes agree with
// (32 temperate) and the old table did not. Without the twelve-pixel correction the same file
// gives High Rock four settlements with no climate at all (they sample open sea) and puts
// Daggerfall in the mountains.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseBsa } from '../../src/arena/bsaArchive.js';
import { parseImg } from '../../src/arena/image.js';
import { parseCityData, PROVINCE_BLOCK_SIZE } from '../../src/arena/cityDataFile.js';
import {
  FAIL_SAFE_REACH, SEA_WRAP_PIXELS, TERRAIN_CLIMATE, TERRAIN_FALLBACK, TERRAIN_GLYPH,
  TERRAIN_SEA, WorldMap, loadWorldMap,
} from '../../src/game/worldMap.js';
import {
  CYRODIIL_SETTLEMENTS, IMPERIAL_PROVINCE_ID, cyrodiilEntryFor, fillImperialProvince,
  localPointOf,
} from '../../src/game/cyrodiil.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const haveInstall = fs.existsSync(path.join(ARENA, 'CITYDATA.64'))
  && fs.existsSync(path.join(ARENA, 'GLOBAL.BSA'));
const noInstall = haveInstall ? false : `the install is not beside this checkout (${ARENA})`;

const W = 320;
const H = 200;
const N = W * H;

/** The index `terrainAt` samples for a request — the original's own `x + y·width − 12`. */
const sampleIndex = (x, y) => ((x + y * W - SEA_WRAP_PIXELS) % N + N) % N;

/** A world over a synthetic `TERRAIN.IMG`: paint by *sampled* index, everything else sea. */
function synthetic(samples = []) {
  const indices = new Uint8Array(N).fill(TERRAIN_SEA);
  for (const [index, cls] of samples) indices[index] = cls;
  return new WorldMap({ cityData: emptyCityData(), terrain: { width: W, height: H, indices } });
}

/** `CITYDATA.64`'s size, all zeroes, with a small rectangle so nothing warns. */
function emptyCityData() {
  const bytes = new Uint8Array(9 * PROVINCE_BLOCK_SIZE);
  for (let i = 0; i < 9; i++) {
    const at = i * PROVINCE_BLOCK_SIZE;
    bytes[at + 24] = 4;
    bytes[at + 26] = 4;
  }
  return bytes;
}

/** A province block with chosen settlement slots — for the fill's own rules. */
function provinceWith(provinceID, names) {
  const bytes = new Uint8Array(9 * PROVINCE_BLOCK_SIZE);
  bytes[provinceID * PROVINCE_BLOCK_SIZE + 24] = 130;
  bytes[provinceID * PROVINCE_BLOCK_SIZE + 26] = 90;
  // `names` is a map of settlement slot (0…31) to a name; an absent slot is a placeholder.
  for (const [slot, name] of names) {
    const at = provinceID * PROVINCE_BLOCK_SIZE + 28 + slot * 25;
    for (let i = 0; i < name.length; i++) bytes[at + i] = name.charCodeAt(i);
    // a real local point, so the record is not the all-zero placeholder shape
    new DataView(bytes.buffer).setUint16(at + 20, 40 + slot, true);
    new DataView(bytes.buffer).setUint16(at + 22, 30 + slot, true);
  }
  return parseCityData(bytes).provinces[provinceID];
}

/** The install's own world, read once. */
let cachedWorld = null;
async function installedWorld() {
  if (!cachedWorld) {
    const archive = parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))), 'GLOBAL.BSA');
    cachedWorld = await loadWorldMap({
      must: async (name) => new Uint8Array(fs.readFileSync(path.join(ARENA, name))),
      img: async (name) => parseImg(archive.get(name), name),
    });
  }
  return cachedWorld;
}

// ── D-38 · the classes, on their own ────────────────────────────────────────────────────────

test('the six land classes are Arena\u2019s own three climates, in the game\u2019s own pairs', () => {
  // The table this project shipped until D-38 — 249/250 temperate, 251/252 mountain, 253/254
  // desert — is a *shift* of this one, which is why every biome landed one province over.
  assert.deepEqual({ ...TERRAIN_CLIMATE }, {
    249: 'mountain', 250: 'mountain',
    251: 'temperate', 254: 'temperate',
    252: 'desert', 253: 'desert',
  });
  assert.equal(TERRAIN_SEA, 248);
  assert.equal(TERRAIN_FALLBACK, 254, 'the original gives up on temperate, not on sea');
  assert.equal(SEA_WRAP_PIXELS, 12);
  assert.equal(FAIL_SAFE_REACH, 200);
  for (const index of [248, 249, 250, 251, 252, 253, 254]) {
    assert.ok(TERRAIN_GLYPH[index], `TERRAIN_GLYPH has a glyph for ${index}`);
  }
});

test('every sample is taken twelve pixels to the left of the pixel asked for', () => {
  // `getFailSafeAt` shifts **every** read, land or sea, and the shift is the *linear index*,
  // so it wraps around the whole 320×200 buffer: the pixel for (100,50) is read at
  // x + y·320 − 12. Painting the point's own pixel a different class proves which one wins.
  const own = 100 + 50 * W;
  const shifted = sampleIndex(100, 50);
  assert.notEqual(own, shifted);
  const world = synthetic([[shifted, 251], [own, 253]]);
  assert.equal(world.terrainAt({ x: 100, y: 50 }), 251, 'the class twelve to the left, not the point\u2019s own');
  assert.equal(world.climateAt({ x: 100, y: 50 }), 'temperate');
});

test('the shift is a linear index, so it wraps across a row', () => {
  // A request in row 1 samples twelve pixels before it in the buffer — i.e. a pixel in the
  // tail of row 0, not the same column of the row above.
  const world = synthetic([[sampleIndex(5, 1), 249]]);
  assert.equal(sampleIndex(5, 1), 5 + W - 12, 'ten cells into the previous row');
  assert.equal(world.terrainAt({ x: 5, y: 1 }), 249);
  assert.equal(world.climateAt({ x: 5, y: 1 }), 'mountain');
});

test('a sea sample walks outwards, below then above then right then left', () => {
  const at = (x, y) => sampleIndex(x, y);
  const below = synthetic([[at(50, 49), 253]]);
  assert.equal(below.terrainAt({ x: 50, y: 48 }), 253, 'below wins when several directions have land');
  const order = synthetic([[at(50, 49), 253], [at(50, 47), 251], [at(51, 48), 252], [at(49, 48), 250]]);
  assert.equal(order.terrainAt({ x: 50, y: 48 }), 253, 'below before above, right and left');
  assert.equal(synthetic([[at(50, 47), 251]]).terrainAt({ x: 50, y: 48 }), 251, 'then above');
  assert.equal(synthetic([[at(51, 48), 252]]).terrainAt({ x: 50, y: 48 }), 252, 'then right');
  assert.equal(synthetic([[at(49, 48), 250]]).terrainAt({ x: 50, y: 48 }), 250, 'then left');
  // The distance grows only when all four cardinal directions are sea at the nearer one.
  const farther = synthetic([[at(50, 50), 254]]);
  assert.equal(farther.terrainAt({ x: 50, y: 48 }), 254, 'distance 2, the first that finds land');
});

test('a pixel of nothing but sea answers the original\u2019s own giving-up class, never sea', () => {
  const world = synthetic();
  assert.equal(world.terrainAt({ x: 100, y: 100 }), TERRAIN_FALLBACK);
  assert.equal(world.climateAt({ x: 100, y: 100 }), 'temperate');
  // Which is the invariant that matters: no world pixel answers *sea* as a climate. The old
  // reading returned the sea constant and let `climateAt` fall back to temperate by accident.
  assert.notEqual(world.terrainAt({ x: 100, y: 100 }), TERRAIN_SEA);
});

// ── D-38 · the install's own provinces ──────────────────────────────────────────────────────

test('no settlement of Tamriel is left without a climate', { skip: noInstall }, async () => {
  const world = await installedWorld();
  const seaSampling = world.settlements().filter((l) => world.terrainAt(l.global) === TERRAIN_SEA);
  assert.deepEqual(seaSampling.map((l) => l.name), [], 'the fail-safe leaves no settlement at sea');
  const climates = new Set(world.settlements().map((l) => l.climate));
  assert.deepEqual([...climates].sort(), ['desert', 'mountain', 'temperate']);
});

test('the Imperial City is temperate, and Cyrodiil\u2019s country is not a desert', { skip: noInstall }, async () => {
  // The owner's own words: *"the imperial city is in the desert instead of temperate"*. It is
  // the game's `TEMPERATE` pixel (254) and UESP's Imperial Province describes grassland.
  const world = await installedWorld();
  const city = world.byName('Imperial City');
  assert.equal(city.climate, 'temperate');
  assert.equal(world.terrainAt(city.global), 254);
  assert.equal(world.provinces[city.provinceID].name, 'Imperial Province');
});

test('Skyrim\u2019s own pixels are mountain, all 32 of its settlements', { skip: noInstall }, async () => {
  // The **pixel** is the game's own reading (D-38). What Skyrim's *ground* is, this project decides
  // above that reading (B18/D-41: *"skyrim needs to be a mix of normal mountain and temperate"*), so
  // the check that belongs here is the pixel's, and the mix is held by
  // `unit/provincestyle.test.mjs`.
  const world = await installedWorld();
  const skyrim = world.settlementsOf(2);
  assert.equal(skyrim.length, 32);
  assert.deepEqual([...new Set(skyrim.map((l) => l.terrainClimate))], ['mountain']);
  assert.deepEqual([...new Set(skyrim.map((l) => l.climate))].sort(), ['mountain', 'temperate'],
    'and the ground is the province\u2019s own mix');
});

test('High Rock: two temperate settlements, and Daggerfall is one of them', { skip: noInstall }, async () => {
  const world = await installedWorld();
  const highRock = world.settlementsOf(0);
  const temperate = highRock.filter((l) => l.climate === 'temperate').map((l) => l.name).sort();
  assert.deepEqual(temperate, ['Daggerfall', 'Reich Gradkeep'],
    'UESP: "warmer forests in the southwest around Daggerfall" — the province is thirty mountain and these two');
  assert.equal(highRock.filter((l) => l.climate === 'mountain').length, 30);
});

test('Valenwood\u2019s mountains are the northern ones, around Arenthia', { skip: noInstall }, async () => {
  const world = await installedWorld();
  const mountain = world.settlementsOf(5).filter((l) => l.climate === 'mountain').map((l) => l.name).sort();
  assert.deepEqual(mountain, ['Arenthia', 'Ebon Ro', 'Thormar Keep']);
});

test('Elsweyr is no desert at all, which is what Arena says and the old table did not', { skip: noInstall }, async () => {
  // UESP, Arena:Elsweyr: the province is "completely devoid of desert biome". The shipped
  // table called its settlements desert by the dozen; the game's own classes call them all
  // temperate.
  const world = await installedWorld();
  assert.deepEqual([...new Set(world.settlementsOf(6).map((l) => l.climate))], ['temperate']);
});

test('every settlement\u2019s pixel reading is the terra`terrainAt` gives it, and never sea', { skip: noInstall }, async () => {
  // A restatement of the D-38 pipeline, so a future pass cannot skip the fail-safe: the **pixel**
  // reading is the class `terrainAt` gives, `terrainAt` is never the sea constant, and the *ground*
  // the game uses is that reading unless a province (or a named place) has a reading of its own —
  // which is B18's law (`game/provinceStyle.js`, `unit/provincestyle.test.mjs`), not this file's.
  const world = await installedWorld();
  let overridden = 0;
  for (const location of world.settlements()) {
    const cls = world.terrainAt(location.global);
    assert.notEqual(cls, TERRAIN_SEA, `${location.name} samples sea`);
    assert.equal(location.terrainClimate, TERRAIN_CLIMATE[cls], `${location.name} (${cls})`);
    if (location.climate !== location.terrainClimate) overridden++;
  }
  assert.ok(overridden > 0 && overridden < world.settlements().length,
    `${overridden} of ${world.settlements().length} settlements have a ground of their own`);
});

// ── D-39 · the Imperial Province, which Arena left empty ────────────────────────────────────

test('the table fills the file\u2019s own slots: 7 cities, 8 towns, 16 villages', () => {
  assert.equal(CYRODIIL_SETTLEMENTS.length, 31, 'the province has 32 settlements and one is named by the file');
  const slots = CYRODIIL_SETTLEMENTS.map((e) => `${e.kind}${e.index}`).sort();
  assert.equal(new Set(slots).size, 31, 'one entry per slot, and no slot twice');
  assert.deepEqual(slots.filter((s) => s.startsWith('city')).sort(),
    ['city1', 'city2', 'city3', 'city4', 'city5', 'city6', 'city7'],
    'the city-state slot 0 is the Imperial City\u2019s own record');
  assert.equal(slots.filter((s) => s.startsWith('town')).length, 8);
  assert.equal(slots.filter((s) => s.startsWith('village')).length, 16);
  const names = CYRODIIL_SETTLEMENTS.map((e) => e.name);
  assert.equal(new Set(names).size, names.length, 'no two places share a name — the map would be a lie');
  for (const entry of CYRODIIL_SETTLEMENTS) {
    const { x, y } = localPointOf(entry.at);
    assert.ok(x >= 0 && x <= 320 && y >= 0 && y <= 200, `${entry.name} is inside the province (${x},${y})`);
    assert.ok(entry.source === 'oblivion' || entry.source === 'eso', `${entry.name} names its later source`);
  }
  assert.equal(cyrodiilEntryFor({ kind: 'city', index: 0 }), null, 'the Imperial City is the file\u2019s own record');
  assert.equal(cyrodiilEntryFor({ kind: 'dungeon', index: 3 }), null, 'a dungeon is never a settlement here');
});

/** Nine provinces, the ninth of them a `CITYDATA` block with chosen records named. */
function syntheticProvinces(named) {
  const provinces = new Array(9).fill(null).map((_, id) => ({
    id, name: `province ${id}`, rect: { x: 0, y: 0, width: 130, height: 90 }, locations: [],
  }));
  provinces[IMPERIAL_PROVINCE_ID] = provinceWith(IMPERIAL_PROVINCE_ID, named);
  return provinces;
}

test('the fill places every nameless slot the table has an entry for', () => {
  const { provinces: out, warnings, filled } = fillImperialProvince(
    syntheticProvinces([[0, 'Imperial City']]),
  );
  // City slots 1–7, town slots 0–7 and village slots 0–15 — thirty-one records, thirty-one
  // entries — and city slot 0 is the file's own named record, which nothing touches.
  assert.equal(filled, 31);
  assert.deepEqual(warnings, []);
  const locations = out[IMPERIAL_PROVINCE_ID].locations;
  const anvil = locations.find((l) => l.name === 'Anvil');
  assert.deepEqual(anvil.local, localPointOf([0.05, 0.60]), 'the fraction became the record\u2019s local point');
  assert.equal(anvil.kind, 'city');
  assert.equal(anvil.index, 1);
  assert.equal(anvil.placed, true);
  assert.equal(anvil.id, 1, 'the file\u2019s own record id is kept');
  const imperial = locations.find((l) => l.name === 'Imperial City');
  assert.deepEqual(imperial.local, { x: 40, y: 30 }, 'the file\u2019s own point survives');
  assert.equal(imperial.placed, undefined, 'and a named record is not "placed" — it was already a place');
  assert.equal(locations.filter((l) => l.kind === 'dungeon').length, 16, 'the province\u2019s dungeons are untouched');
  // And the other eight provinces are returned exactly as they came in.
  const before = syntheticProvinces([[0, 'Imperial City']]);
  const after = fillImperialProvince(before).provinces;
  for (const id of [0, 1, 2, 3, 4, 5, 6, 7]) assert.equal(after[id], before[id], `province ${id} is not rewritten`);
});

test('a placeholder with no later-lore slot is left out of the world, with a warning', () => {
  // The honest half of the rule: a nameless record the table has no place for is *not a
  // place*, rather than a marker at someone else's pixel with an empty name on it. The one
  // slot the table deliberately omits is city slot 0 — the Imperial City's own record.
  const { provinces: out, warnings, filled } = fillImperialProvince(syntheticProvinces([]));
  assert.equal(filled, 31, 'the thirty-one slots the table has entries for are still filled');
  assert.equal(warnings.length, 1, 'and the one with no place in it is said so');
  assert.match(warnings[0], /record 0 \(city 0\) is a placeholder with no place in it/);
  const locations = out[IMPERIAL_PROVINCE_ID].locations;
  assert.deepEqual(locations.filter((l) => l.kind !== 'dungeon' && !l.name).map((l) => l.id), [],
    'no nameless settlement survived (the sixteen dungeons have no name in the file and are not settlements)');
  assert.ok(!locations.some((l) => l.kind === 'city' && l.index === 0), 'the unplaceable record is not a place');
  assert.equal(locations.length, 31 + 16, 'thirty-one places and the province\u2019s sixteen dungeons');
});

test('the install\u2019s Imperial Province: 31 placeholders become Cyrodiil', { skip: noInstall }, async () => {
  const world = await installedWorld();
  assert.equal(world.placed, 31, 'the released file\u2019s thirty-one nameless records');
  assert.deepEqual(world.warnings, [], 'and nothing left over');
  const province = world.provinces[IMPERIAL_PROVINCE_ID];
  assert.equal(province.name, 'Imperial Province');
  const settlements = world.settlementsOf(IMPERIAL_PROVINCE_ID);
  assert.equal(settlements.length, 32, 'the province has its thirty-two places');
  assert.deepEqual(settlements.filter((l) => !l.name).map((l) => l.id), [], 'not one of them is nameless');
  const cities = settlements.filter((l) => l.kind === 'city').map((l) => l.name).sort();
  assert.deepEqual(cities, ['Anvil', 'Bravil', 'Bruma', 'Cheydinhal', 'Chorrol', 'Imperial City', 'Leyawiin', 'Skingrad'],
    'the Imperial City and the seven cities of the later games');
  assert.ok(settlements.some((l) => l.name === 'Kvatch' && l.kind === 'town'), 'Kvatch is the town the Oblivion Crisis left it');
});

test('the file\u2019s own answer for the Imperial City is not rewritten', { skip: noInstall }, async () => {
  const world = await installedWorld();
  const bytes = new Uint8Array(fs.readFileSync(path.join(ARENA, 'CITYDATA.64')));
  const fileRecord = parseCityData(bytes).provinces[IMPERIAL_PROVINCE_ID].locations[0];
  const record = world.provinces[IMPERIAL_PROVINCE_ID].locations[0];
  assert.equal(fileRecord.name, 'Imperial City');
  assert.deepEqual({ name: record.name, local: record.local, id: record.id },
    { name: fileRecord.name, local: fileRecord.local, id: fileRecord.id });
});

test('no province draws two of its settlements on one another', { skip: noInstall }, async () => {
  // The defect in one line: thirty-one records with local (0,0) all scaled to the province
  // rectangle's corner (107,61), so the Imperial Province's map drew thirty-one markers on
  // top of each other and only one of them could ever be selected. The law is *within* a
  // province, because a province is what the map draws at once — and the map's own selection
  // walks the shown province's places. (Two provinces' rectangles do overlap where Arena's
  // own rectangles meet — Hammerfell's Stonedale stands on the pixel Chorrol's neighbourhood
  // also covers, and that is the original's geometry, not this fill's.)
  const world = await installedWorld();
  const settlements = world.settlements();
  assert.equal(settlements.length, 288);
  for (const province of world.provinces) {
    const of = world.settlementsOf(province.id);
    assert.equal(of.length, 32, `${province.name} has its thirty-two places`);
    const pixels = new Set(of.map((l) => `${l.global.x},${l.global.y}`));
    assert.equal(pixels.size, 32, `${province.name}: every one of them on a pixel of its own`);
    const names = new Set(of.map((l) => l.name));
    assert.equal(names.size, 32, `${province.name}: and no two of them share a name`);
  }
});

test('the file repeats two names across provinces, which `byName` cannot tell apart', { skip: noInstall }, async () => {
  // Measured, and **Arena's own data**, not this fill's: `CITYDATA.64` names a village
  // `Glenpoint` in High Rock (local 46,150) and another in Valenwood (99,98), and a
  // `Riverbridge` in Morrowind (112,131) and another in Black Marsh (228,75). Two places,
  // one name — and `world.byName` answers the first, so the second is unreachable by name.
  // The port's own travel URL is `?location=<name>`, which makes this a real defect (D-40 in
  // `docs/DEFECTS.md`) rather than a curiosity; this check exists so the pass that fixes it
  // has the exact pair, and so a later fill cannot quietly add a third.
  const world = await installedWorld();
  const seen = new Map();
  for (const l of world.settlements()) {
    if (!seen.has(l.name)) seen.set(l.name, []);
    seen.get(l.name).push(`${l.province}:${l.global.x},${l.global.y}`);
  }
  const repeats = [...seen].filter(([, list]) => list.length > 1).map(([name, list]) => `${name} [${list.join(' ')}]`).sort();
  assert.deepEqual(repeats, [
    'Glenpoint [High Rock:52,71 Valenwood:118,141]',
    'Riverbridge [Morrowind:226,84 Black Marsh:253,133]',
  ], 'the file repeats exactly these two names, and the Cyrodiil fill adds none');
  assert.equal(world.byName('Glenpoint').province, 'High Rock', 'the first match is what the name resolves to today');
});

test('and a city and a country of its own, not thirty-one of the same', { skip: noInstall }, async () => {
  // `citySeed` is the packed local point and `wildernessSeed` the name's first four letters:
  // the placeholders were all seed 0 in both, so they were one city in one country.
  const world = await installedWorld();
  const cyrodiil = world.settlementsOf(IMPERIAL_PROVINCE_ID);
  assert.equal(new Set(cyrodiil.map((l) => l.citySeed)).size, 32, 'thirty-two different cities');
  assert.equal(new Set(cyrodiil.map((l) => l.wildernessSeed)).size, 32, 'and thirty-two different countries');
  assert.equal(new Set(cyrodiil.map((l) => l.name)).size, 32);
});
