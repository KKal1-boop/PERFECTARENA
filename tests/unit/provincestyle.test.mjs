// WHAT EACH PROVINCE IS — A PLACE'S TWO CLIMATES, ITS WEATHER AND ITS PEOPLE (block B18, D-41).
//
// The owner, played side by side with the real Arena on 2026-10-16:
//
//   *"elsweyr and summerset isle should be temperate but with trees and building textures of desert
//   also morrowind should be mostly desert but with mountain architecture skyrim needs to be a mix of
//   normal mountain and temperate but in some cities like winterhold it never needs to stop snowing …
//   also sentinel should be desert … also i want in morrowind mostly dark elf npcs in skyrim mostly
//   nords in morrowind i want lizard mans repurpused as npcs to simulate argonians etc etc all
//   provinces should have a mix of people but mostly their people"*
//
// A pixel can only say one climate (D-38 is the game's own reading of `TERRAIN.IMG`), so this is the
// layer above it: `game/provinceStyle.js` gives a place a **ground** and an **architecture** that may
// differ, a **weather** a place never stops having, and the **bank pool** its people are named from.
// The law's order matters and is what these checks hold: a named place's own row wins, then the
// province's, then **the pixel's own class** — so the eight rows that say `null` are the game's
// answer, not this project's.
//
// `docs/DEFECTS.md` D-41 also names the two things this pass did **not** do: the *sheets* a person is
// drawn from are still the archive's own art (the Argonian and Khajiit art Arena does not ship is
// queue item 0f), and the sibling name corpus has **eight race banks and no `argonian` key**, so
// Black Marsh's folk carry the closest names the file has.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseBsa } from '../../src/arena/bsaArchive.js';
import { parseImg } from '../../src/arena/image.js';
import { loadWorldMap } from '../../src/game/worldMap.js';
import { parseInf, decryptInf, withGroundFloors } from '../../src/arena/infFile.js';
import { cityInfName, cityInfNames } from '../../src/game/tables/cityBlocks.js';
import {
  PLACE_STYLE, PROVINCE_STYLE, RACE_NAME_BANKS, SKYRIM_SNOW_LINE, nameBanksFor, raceOf, styleOf,
} from '../../src/game/provinceStyle.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const haveInstall = fs.existsSync(path.join(ARENA, 'CITYDATA.64'))
  && fs.existsSync(path.join(ARENA, 'GLOBAL.BSA'));
const noInstall = haveInstall ? false : `the install is not beside this checkout (${ARENA})`;

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

// ── the law, on its own ─────────────────────────────────────────────────────────────────────

test('every province has its own people first, and a pool of them', () => {
  for (const id of Object.keys(PROVINCE_STYLE)) {
    const row = PROVINCE_STYLE[id];
    assert.ok(row.name, `province ${id} has a name`);
    assert.ok(row.people.length >= 5, `${row.name} has a street's worth of races (${row.people.length})`);
    for (const key of row.people) {
      assert.ok(RACE_NAME_BANKS.includes(key), `${row.name}: "${key}" is a bank the corpus has`);
    }
    // *"all provinces should have a mix of people but mostly their people"*: the province's own race
    // is the most common entry in its own pool, and never the only one.
    const own = row.people[0];
    const count = row.people.filter((k) => k === own).length;
    assert.ok(count > 1, `${row.name}: its own people are more than one in eight (${count})`);
    assert.ok(new Set(row.people).size >= 4, `${row.name}: and the street is not one race (${new Set(row.people).size})`);
    assert.equal(row.people.filter((k) => k === own).length,
      Math.max(...RACE_NAME_BANKS.map((k) => row.people.filter((x) => x === k).length)),
      `${row.name}: nothing outnumbers ${own}`);
  }
});

test('the provinces the owner named have the ground and the architecture he asked for', () => {
  const style = (provinceID, terrainClimate, name = 'a place', global = { x: 0, y: 100 }) =>
    styleOf({ provinceID, name, terrainClimate, global });
  // *"morrowind should be mostly desert but with mountain architecture"*
  assert.deepEqual(
    (({ ground, architecture }) => ({ ground, architecture }))(style(3, 'mountain')),
    { ground: 'desert', architecture: 'mountain' });
  // *"elsweyr and summerset isle should be temperate but with trees and building textures of desert"*
  for (const province of [4, 6]) {
    assert.deepEqual(
      (({ ground, architecture }) => ({ ground, architecture }))(style(province, 'mountain')),
      { ground: 'temperate', architecture: 'desert' },
      `province ${province} is temperate ground with desert buildings, whatever its pixel says`);
  }
  // *"sentinel should be desert"* — and its own pixel is mountain, which is why the row exists.
  assert.equal(style(1, 'mountain', 'Sentinel').ground, 'desert');
  assert.equal(style(1, 'mountain', 'Sentinel').named, true);
  assert.equal(style(1, 'desert', 'Rihad').ground, 'desert', 'the rest of Hammerfell keeps its pixel (Rihad IS desert)');
  assert.equal(style(1, 'mountain', 'Elinhir').ground, 'mountain', 'and a Hammerfell town whose pixel is mountain stays mountain');
  // *"skyrim needs to be a mix of normal mountain and temperate"*
  assert.equal(style(2, 'mountain', 'a hold', { x: 150, y: 30 }).ground, 'mountain', 'north of the line: mountain');
  assert.equal(style(2, 'mountain', 'a hold', { x: 150, y: 70 }).ground, 'temperate', 'south of it: temperate');
  assert.equal(SKYRIM_SNOW_LINE, 50);
  // *"in some cities like winterhold it never needs to stop snowing"*
  const winterhold = style(2, 'mountain', 'Winterhold', { x: 150, y: 30 });
  assert.equal(winterhold.weather, 'snow');
  assert.equal(winterhold.ground, 'mountain', 'and it is still a city of the frozen north');
  assert.equal(style(2, 'mountain', 'Dawnstar', { x: 120, y: 30 }).weather, null, 'no other Skyrim city has a weather of its own');
});

test('a place this table says nothing about is exactly what its pixel says', () => {
  for (const climate of ['temperate', 'mountain', 'desert']) {
    const style = styleOf({ provinceID: 0, name: 'Daggerfall', terrainClimate: climate, global: { x: 43, y: 74 } });
    assert.equal(style.ground, climate);
    assert.equal(style.architecture, null, 'and its architecture is the ground, i.e. the game\u2019s own class');
    assert.equal(style.weather, null);
    assert.equal(style.named, false);
  }
  assert.equal(styleOf({ provinceID: 7, name: 'x', terrainClimate: 'temperate' }).province, 'Black Marsh');
  assert.equal(styleOf({ provinceID: 99, name: 'x', terrainClimate: 'desert' }).ground, 'desert',
    'a province with no row is the pixel\u2019s own, never a default');
});

test('the people pools are the corpus\u2019s own banks, and the eight races have no Argonian one', () => {
  assert.deepEqual([...RACE_NAME_BANKS], ['breton', 'redguard', 'nord', 'darkElf', 'highElf', 'woodElf', 'khajiit', 'imperial']);
  assert.equal(raceOf(2), 'nord', 'Skyrim is Nords — the owner asked for it by name');
  assert.equal(raceOf(3), 'darkElf', 'and Morrowind is the Dunmer');
  assert.equal(raceOf(6), 'khajiit');
  assert.equal(raceOf(99), null, 'a province with no row has no pool of its own');
  assert.ok(!RACE_NAME_BANKS.includes('argonian'),
    'the corpus has no Argonian bank (the row in DEFECTS.md says what Black Marsh does instead)');
  assert.ok(nameBanksFor(7).length >= 5, 'and Black Marsh still gets a street of names');
  assert.equal(nameBanksFor(0)[0], 'breton');
});

test('a settlement borrows its country\u2019s floors under its own architecture', () => {
  // The owner, after the first version of this law landed: *"MORROWIND NOW JUST SAYS DESERT BUT
  // WHEN YOU GET INTO IT ITS COMPLETELY MOUNTAIN EVEN THE GROUND AND THERE IS NO DESERT LANDSCAPE
  // WITH MOUNT ARCHITECTURE"*. A level's whole look comes from one `.INF`, so the province law has
  // to be carried on **both** of an INF's tables: the `@FLOORS` entries are the ground, the
  // `@WALLS` entries are the architecture, and `withGroundFloors` puts the country's floors under
  // the city's walls.
  assert.deepEqual(cityInfNames({ ground: 'desert', architecture: 'mountain', weather: 'clear' }),
    { infName: 'MCN.INF', groundInfName: 'DCN.INF' }, 'Morrowind\u2019s pair');
  assert.deepEqual(cityInfNames({ ground: 'temperate', architecture: 'temperate' }),
    { infName: 'TCN.INF', groundInfName: null }, 'and one INF when the two agree — no second read');
  assert.deepEqual(cityInfNames({ ground: 'desert', architecture: 'mountain', weather: 'snow' }),
    { infName: 'MCS.INF', groundInfName: 'DCN.INF' }, 'a snowy city still borrows its country (a desert has no snow)');

  if (noInstall) return;
  const archive = parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))), 'GLOBAL.BSA');
  const inf = (name) => parseInf(decryptInf(archive.get(name)), name);
  const mountain = inf('MCN.INF');
  const desert = inf('DCN.INF');
  const temperate = inf('TCN.INF');
  // The merge's precondition, measured: the three climates' city INFs carry the same two tables —
  // five floor entries, fifty-four wall entries. If they ever differ, the merge refuses rather
  // than shifting an index (checked below).
  for (const [name, parsed] of [['MCN.INF', mountain], ['DCN.INF', desert], ['TCN.INF', temperate]]) {
    assert.equal(parsed.floorTextureCount, 5, `${name}: five floors`);
    assert.equal(parsed.voxelTextures.length, 59, `${name}: fifty-nine voxel textures`);
  }
  const merged = withGroundFloors(mountain, desert);
  assert.equal(merged.merged, true);
  assert.equal(merged.reason, null);
  assert.equal(merged.inf.groundFloorsFrom, 'DCN.INF');
  assert.deepEqual(merged.inf.voxelTextures.slice(0, 5), desert.voxelTextures.slice(0, 5),
    'the floors are the country\u2019s');
  assert.deepEqual(merged.inf.voxelTextures.slice(5), mountain.voxelTextures.slice(5),
    'and the walls, flats and everything else are the architecture\u2019s');
  assert.equal(merged.inf.voxelTextures.length, 59, 'nothing was added or lost');
  assert.equal(merged.inf.voxelTextures[0].filename, 'NROADD.IMG', 'a desert road under a mountain city');
  assert.equal(merged.inf.voxelTextures[5].filename, 'DEQ.IMG', 'and the mountain\u2019s own wall');
  assert.equal(mountain.voxelTextures[0].filename, 'NROAD.IMG', 'the architecture\u2019s own INF is untouched');

  // The refusal path: an index shift would repaint the wrong voxel, so a floor table of a
  // different length is left alone and says why.
  const thin = { ...mountain, floorTextureCount: 3 };
  assert.equal(withGroundFloors(thin, desert).merged, false);
  assert.match(withGroundFloors(thin, desert).reason, /floor tables differ/);
  assert.equal(withGroundFloors(thin, desert).inf, thin, 'and the level is built as it always was');
  assert.equal(withGroundFloors({ ...mountain, floorTextureCount: 0 }, desert).merged, false);
});

// ── the install, place by place ─────────────────────────────────────────────────────────────

test('every settlement of the world has a ground, an architecture and a pixel of its own', { skip: noInstall }, async () => {
  const world = await installedWorld();
  const climates = new Set(['temperate', 'mountain', 'desert']);
  for (const settlement of world.settlements()) {
    assert.ok(climates.has(settlement.terrainClimate), `${settlement.name}: a real pixel class`);
    assert.ok(climates.has(settlement.climate), `${settlement.name}: a real ground`);
    assert.ok(climates.has(settlement.architecture), `${settlement.name}: a real architecture`);
  }
  // The ground is the pixel unless the province (or the place) says otherwise, and the four
  // provinces the owner named are the ones that differ.
  const differ = world.settlements().filter((l) => l.climate !== l.terrainClimate);
  assert.deepEqual([...new Set(differ.map((l) => l.province))].sort(),
    ['Hammerfell', 'Morrowind', 'Skyrim'],
    'three provinces move their ground off the pixel: Morrowind\u2019s ashlands, Skyrim\u2019s southern holds, Sentinel\u2019s Alik\u2019r');
  const archDiffer = world.settlements().filter((l) => l.architecture !== l.climate);
  assert.deepEqual([...new Set(archDiffer.map((l) => l.province))].sort(), ['Elsweyr', 'Morrowind', 'Summurset Isle'],
    'and three build out of a different climate than their ground');
  // Elsweyr and the Summerset Isles are the pair the owner described exactly this way: their
  // *country* is the pixel's own temperate one (so no ground moves) and only the **buildings** are
  // the desert's.
  for (const provinceID of [4, 6]) {
    const of = world.settlementsOf(provinceID);
    assert.deepEqual([...new Set(of.map((l) => l.climate))], [...new Set(of.map((l) => l.terrainClimate))],
      `${PROVINCE_STYLE[provinceID].name}: the ground is the pixel\u2019s own`);
  }
});

test('Morrowind\u2019s cities are built of mountain `.INF`s on a desert ground', { skip: noInstall }, async () => {
  const world = await installedWorld();
  const morrowind = world.settlementsOf(3);
  assert.equal(morrowind.length, 32);
  assert.deepEqual([...new Set(morrowind.map((l) => l.climate))], ['desert'], 'the country is the ashlands');
  assert.deepEqual([...new Set(morrowind.map((l) => l.architecture))], ['mountain'], 'and the cities are mountain-built');
  for (const city of morrowind.filter((l) => l.kind === 'city')) {
    const inf = cityInfName({ climate: city.architecture, location: 'city', weather: city.weather ?? 'clear' });
    assert.ok(inf.startsWith('M'), `${city.name}'s own .INF is ${inf}`);
  }
});

test('Elsweyr and the Summerset Isles are temperate country with desert buildings', { skip: noInstall }, async () => {
  const world = await installedWorld();
  for (const provinceID of [4, 6]) {
    const of = world.settlementsOf(provinceID);
    assert.deepEqual([...new Set(of.map((l) => l.climate))], ['temperate'], `${PROVINCE_STYLE[provinceID].name} is temperate country`);
    assert.deepEqual([...new Set(of.map((l) => l.architecture))], ['desert'], 'with desert-textured places');
    const city = of.find((l) => l.kind === 'city');
    assert.ok(cityInfName({ climate: city.architecture, location: 'city', weather: 'clear' }).startsWith('D'),
      `${city.name}\u2019s own .INF is desert`);
  }
});

test('Sentinel is desert and Winterhold never stops snowing', { skip: noInstall }, async () => {
  const world = await installedWorld();
  const sentinel = world.byName('Sentinel');
  assert.equal(sentinel.terrainClimate, 'mountain', 'its pixel');
  assert.equal(sentinel.climate, 'desert', 'and the later games put it on the Alik\u2019r');
  const winterhold = world.byName('Winterhold');
  assert.equal(winterhold.weather, 'snow');
  assert.equal(winterhold.climate, 'mountain', 'still a city of the north');
  assert.ok(cityInfName({ climate: winterhold.architecture, location: 'city', weather: winterhold.weather }).endsWith('S.INF'),
    'and its own .INF is the snow one');
  assert.equal(PLACE_STYLE.length, 2);
});

test('Skyrim itself is the mix the owner asked for', { skip: noInstall }, async () => {
  const world = await installedWorld();
  const skyrim = world.settlementsOf(2);
  const grounds = {};
  for (const place of skyrim) grounds[place.climate] = (grounds[place.climate] ?? 0) + 1;
  assert.ok(grounds.mountain > 0 && grounds.temperate > 0,
    `Skyrim is both: ${grounds.mountain} mountain, ${grounds.temperate} temperate`);
  assert.equal((grounds.mountain ?? 0) + (grounds.temperate ?? 0), 32);
  assert.ok((grounds.temperate ?? 0) < (grounds.mountain ?? 0), 'and it is mostly the frozen north');
  for (const place of skyrim) {
    assert.equal(place.climate, place.global.y >= SKYRIM_SNOW_LINE ? 'temperate' : 'mountain',
      `${place.name}: the line decides, at y ${place.global.y}`);
  }
});
