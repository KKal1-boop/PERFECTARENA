// MILESTONE 4 UNIT TESTS — ARENA'S CITIES.
//
// A city is assembled, not loaded: a skeleton `.MIF` plus a grid of block `.MIF`s
// chosen by a seeded RNG. Everything that decides *which* blocks and *where* comes
// from tables and one algorithm, so those are what is asserted here — against the
// real archive, where the block-name tables can be checked record by record.
//
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import { ArenaRandom } from '../../src/game/arenaRandom.js';
import {
  BLOCK_TYPE, CITY_BLOCK_SIZE, allBlockMifNames, blockMifName, blockStartPosition,
  cityInfName, cityTemplateName, randomBlockType,
} from '../../src/game/tables/cityBlocks.js';
import { buildCityLevel, detectReservedBlocks, planCity } from '../../src/game/cityPlan.js';
import { decodeLevel } from '../../src/game/mifLevel.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

test('the block-name tables reproduce names that all exist in GLOBAL.BSA', async () => {
  const archive = await data.bsa();
  const names = new Set(archive.names());
  const produced = allBlockMifNames();
  assert.equal(produced.length, (13 + 11 + 10 + 12 + 15 + 11 + 20) * 4);

  const absent = produced.filter((n) => !names.has(n));
  assert.deepEqual(absent, [], `every table-generated block name must exist; missing ${absent.slice(0, 8)}`);

  // And the reverse, which is *not* a bijection: the archive also carries
  // zero-padded aliases (`EQBD09A` beside `EQBD9A`, and `MGBD01..09`), one stray
  // rotation letter (`BSBD1E`) and a bare `BSBD20`. The generator only ever emits
  // `%d` (unpadded), so the check is that every extra name is a known alias or one
  // of the two documented oddballs — never a hole in the tables.
  const blockish = archive.names().filter((n) => /^(EQ|MG|NB|TP|TV|TS|BS)BD\d+[A-D]?\.MIF$/.test(n));
  const knownOddballs = new Set(['BSBD1E.MIF', 'BSBD20.MIF']);
  const isAlias = (n) => /BD0\d[A-D]\.MIF$/.test(n) && produced.includes(n.replace('BD0', 'BD'));
  const codes = ['EQ', 'MG', 'NB', 'TP', 'TV', 'TS', 'BS'];
  const counts = [13, 11, 10, 12, 15, 11, 20];
  const tableCount = (n) => counts[codes.indexOf(n.slice(0, 2))];
  const variation = (n) => Number(/BD(\d+)/.exec(n)[1]);
  // A name is "beyond the count" when the archive has more numbered variants than
  // the table's variation count will ever select. Kept as its own category, and
  // asserted by name below, so a table typo cannot pass as an archive quirk.
  const beyondCount = (n) => variation(n) > tableCount(n);

  const unexplained = blockish.filter((n) => !produced.includes(n) && !isAlias(n) && !knownOddballs.has(n) && !beyondCount(n));
  assert.deepEqual(unexplained, [], `archive block records the tables cannot account for: ${unexplained.slice(0, 8)}`);
  const aliases = blockish.filter((n) => isAlias(n));
  assert.equal(aliases.length, 52, 'the padded aliases are EQ/NB/TP/TV 09 and MG 01..09, four rotations each');

  // Where the archive and the tables disagree, record it rather than smooth it
  // over: the archive holds two more noble-house variants than the variation
  // count will ever select. Six of the seven codes agree exactly, so the count is
  // kept as the original's and the extras are left as data the game never draws.
  const over = [];
  for (let i = 0; i < codes.length; i++) {
    const numbers = blockish
      .filter((n) => n.startsWith(`${codes[i]}BD`) && !/BD0\d/.test(n))
      .map(variation);
    const max = Math.max(...numbers);
    assert.ok(max >= counts[i], `${codes[i]} claims ${counts[i]} variations but the archive only reaches ${max}`);
    if (max !== counts[i]) over.push(`${codes[i]}: table ${counts[i]}, archive ${max}`);
  }
  assert.deepEqual(over, ['NB: table 10, archive 12'], 'the only table/archive disagreement must be the noble house');
  assert.deepEqual(
    blockish.filter(beyondCount).filter((n) => !produced.includes(n)).sort(),
    ['NBBD11A.MIF', 'NBBD11B.MIF', 'NBBD11C.MIF', 'NBBD11D.MIF',
      'NBBD12A.MIF', 'NBBD12B.MIF', 'NBBD12C.MIF', 'NBBD12D.MIF'],
    'the unused noble-house variants must be exactly these eight records',
  );
});

test('every city and wilderness INF name the tables can build exists', async () => {
  const names = new Set((await data.bsa()).names());
  const combos = [
    { location: 'city' }, { location: 'wilderness' },
  ];
  const missing = [];
  for (const location of ['city', 'wilderness']) {
    for (const climate of ['temperate', 'desert', 'mountain']) {
      for (const weather of ['clear', 'overcast', 'rain', 'snow']) {
        const name = cityInfName({ climate, location, weather });
        if (!names.has(name)) missing.push(name);
      }
    }
  }
  // Deserts have no snow template, so DCS/DWS fall back to clear; everything else
  // must be real, or a location would have no textures.
  assert.deepEqual(missing, [], `generated INF names must exist: ${missing.join(', ')}`);
  assert.equal(combos.length, 2);
  assert.equal(cityInfName({ climate: 'temperate', location: 'city', weather: 'rain' }), 'TCW.INF');
  assert.equal(cityInfName({ climate: 'mountain', location: 'wilderness', weather: 'overcast' }), 'MWR.INF');
});

test('every skeleton template name the tables can build exists', async () => {
  const names = new Set((await data.bsa()).names());
  const missing = [];
  for (const type of ['city', 'town', 'village']) {
    for (const coastal of [false, true]) {
      for (let id = 0; id < 10; id++) {
        const name = cityTemplateName({ type, coastal, globalCityID: id });
        if (!names.has(name)) missing.push(name);
      }
    }
  }
  assert.deepEqual(missing, [], `generated skeleton names must exist: ${missing.join(', ')}`);
  assert.equal(cityTemplateName({ type: 'city', coastal: false, globalCityID: 0 }), 'CITY1.MIF');
  assert.equal(cityTemplateName({ type: 'village', coastal: true, globalCityID: 1 }), 'VILLAGW2.MIF');
});

test('ArenaRandom wraps like a uint32 and returns 16-bit values', () => {
  // seed 1: 1 * 7143469 = 7143469, which is 109 * 65536 + 65581 - 65536 = 109 rem
  // 65581... the arithmetic that matters is (value >>> 16) on the wrapped product.
  const random = new ArenaRandom(1);
  const first = random.next();
  assert.equal(first, 109);
  assert.equal(new ArenaRandom(1).getSeed(), 1, 'srand must be observable');
  const values = Array.from({ length: 200 }, () => new ArenaRandom(7).next());
  assert.equal(new Set(values).size, 1, 'the same seed must produce the same draw');
  const seq = new ArenaRandom(7);
  for (let i = 0; i < 500; i++) {
    const v = seq.next();
    assert.ok(v >= 0 && v <= 0xffff && Number.isInteger(v), `draw ${i} out of range: ${v}`);
  }
  // The multiply genuinely must wrap: a double would keep growing.
  const wrap = new ArenaRandom(0xffffffff);
  wrap.next();
  assert.ok(wrap.getSeed() <= 0xffffffff, 'state must stay inside 32 bits');
});

test('randomBlockType follows the original distribution', () => {
  const counts = Object.fromEntries(Object.values(BLOCK_TYPE).map((t) => [t, 0]));
  const random = new ArenaRandom(99);
  const N = 20000;
  for (let i = 0; i < N; i++) counts[randomBlockType(random)]++;
  const share = (t) => counts[t] / N;
  assert.ok(Math.abs(share(BLOCK_TYPE.HOUSES) - 0.45) < 0.02, `houses ${share(BLOCK_TYPE.HOUSES)}`);
  assert.ok(Math.abs(share(BLOCK_TYPE.TAVERN) - 0.20) < 0.02, `tavern ${share(BLOCK_TYPE.TAVERN)}`);
  assert.ok(Math.abs(share(BLOCK_TYPE.EQUIPMENT) - 0.15) < 0.02, `equipment ${share(BLOCK_TYPE.EQUIPMENT)}`);
  assert.ok(Math.abs(share(BLOCK_TYPE.TEMPLE) - 0.10) < 0.02, `temple ${share(BLOCK_TYPE.TEMPLE)}`);
  assert.ok(Math.abs(share(BLOCK_TYPE.NOBLE_HOUSE) - 0.10) < 0.02, `noble ${share(BLOCK_TYPE.NOBLE_HOUSE)}`);
  assert.equal(counts[BLOCK_TYPE.EMPTY] + counts[BLOCK_TYPE.RESERVED], 0, 'only the five real types may appear');
});

test('blockMifName never emits a variation 0 and always names a real file', async () => {
  const names = new Set((await data.bsa()).names());
  const random = new ArenaRandom(4242);
  for (const type of [BLOCK_TYPE.EQUIPMENT, BLOCK_TYPE.MAGES_GUILD, BLOCK_TYPE.NOBLE_HOUSE,
    BLOCK_TYPE.TEMPLE, BLOCK_TYPE.TAVERN, BLOCK_TYPE.SPACER, BLOCK_TYPE.HOUSES]) {
    for (let i = 0; i < 300; i++) {
      const name = blockMifName(type, random);
      assert.ok(!/BD0[A-D]/.test(name), `variation 0 is not a real file: ${name}`);
      assert.ok(names.has(name), `${name} is not in the archive`);
    }
  }
  assert.throws(() => blockMifName(BLOCK_TYPE.RESERVED, random), /no code/);
});

test('a city plan fills every slot and always guarantees the six services', () => {
  for (const blocksPerSide of [4, 5, 6]) {
    const { plan, slots } = planCity({ blocksPerSide, seed: 1234 });
    assert.equal(plan.length, blocksPerSide * blocksPerSide);
    assert.ok(plan.every((t) => t !== BLOCK_TYPE.EMPTY), 'no slot may be left empty');
    for (const type of [BLOCK_TYPE.EQUIPMENT, BLOCK_TYPE.MAGES_GUILD, BLOCK_TYPE.NOBLE_HOUSE,
      BLOCK_TYPE.TEMPLE, BLOCK_TYPE.TAVERN, BLOCK_TYPE.SPACER]) {
      assert.ok(plan.includes(type), `a settlement must have its own block type ${type}`);
    }
    assert.equal(slots.length, plan.length);
    // Slot order is the stamping order: right to left, top to bottom.
    assert.deepEqual(slots[0], { index: 0, row: 0, col: 0, type: plan[0], mif: slots[0].mif });
    assert.equal(slots[blocksPerSide].col, 0);
    assert.equal(slots[blocksPerSide].row, 1);
    assert.ok(slots.every((s) => (s.type === BLOCK_TYPE.RESERVED) === (s.mif === null)));
  }

  // Same seed, same city; different seed, different city.
  const a = planCity({ blocksPerSide: 6, seed: 555 });
  const b = planCity({ blocksPerSide: 6, seed: 555 });
  const c = planCity({ blocksPerSide: 6, seed: 556 });
  assert.deepEqual(a.plan, b.plan);
  assert.deepEqual(a.slots.map((s) => s.mif), b.slots.map((s) => s.mif));
  assert.notDeepEqual(a.slots.map((s) => s.mif), c.slots.map((s) => s.mif));
});

test('reserved slots are kept and are measured, not guessed', async () => {
  const mif = await data.mif('CITY1.MIF');
  const start = blockStartPosition(mif.width, mif.height, 6);
  assert.deepEqual(start, { x: 3, z: 3 }, 'a 120-cell grid centres inside a 127-cell skeleton');

  const reserved = detectReservedBlocks(mif.levels[0], { blocksPerSide: 6, start, width: mif.width, depth: mif.height });
  // CITY1's grid area is bare ground: all it holds is ten entity flats, which are
  // street decoration and must not cost the city five of its thirty-six blocks.
  assert.deepEqual(reserved, [], 'CITY1 has no structure inside its block grid');

  // A reserved slot must really contain *geometry*, and an unreserved one must not.
  const level = mif.levels[0];
  const isEntity = (v) => (v & 0xf000) === 0x8000;
  const anyStructureFor = (subject, width, origin, slots, index) => {
    const row = Math.floor(index / slots);
    const col = index % slots;
    for (let z = 0; z < CITY_BLOCK_SIZE; z++) {
      for (let x = 0; x < CITY_BLOCK_SIZE; x++) {
        const i = (origin.z + row * CITY_BLOCK_SIZE + z) * width + origin.x + col * CITY_BLOCK_SIZE + x;
        const v = subject.map1[i];
        const chasm = subject.flor && ((subject.flor[i] & 0xff00) >> 8) >= 0x0c && ((subject.flor[i] & 0xff00) >> 8) <= 0x0e;
        if ((v !== 0 && !isEntity(v)) || chasm) return true;
      }
    }
    return false;
  };
  const anyStructure = (slots, index) => anyStructureFor(level, mif.width, start, slots, index);
  for (let i = 0; i < 36; i++) assert.equal(reserved.includes(i), anyStructure(6, i), `slot ${i} reservation disagrees with the skeleton`);
  assert.equal(level.map1.some((v) => v !== 0), true, 'the skeleton does place flats, which is why they needed excluding');

  // The rule has to be able to fire, or a broken predicate would look like
  // "nothing is ever reserved". CITY2.MIF really does hold structure inside its
  // grid, and CITYW1.MIF — same size, same grid — does not.
  const city2 = await data.mif('CITY2.MIF');
  const start2 = blockStartPosition(city2.width, city2.height, 6);
  const reserved2 = detectReservedBlocks(city2.levels[0], { blocksPerSide: 6, start: start2, width: city2.width, depth: city2.height });
  assert.ok(reserved2.length > 0, 'CITY2 reserves slots — the measurement must be able to fire');
  for (const index of reserved2) assert.ok(anyStructureFor(city2.levels[0], city2.width, start2, 6, index), `slot ${index} of CITY2 is reserved without structure`);
  // A coastal skeleton is the other half of the rule: `CITYW1.MIF` carries water
  // *inside* its grid, and a reserved slot there must be reserved for the water
  // even though its MAP1 voxels are all air.
  const cityW1 = await data.mif('CITYW1.MIF');
  const startW = blockStartPosition(cityW1.width, cityW1.height, 6);
  const reservedW = detectReservedBlocks(cityW1.levels[0], { blocksPerSide: 6, start: startW, width: cityW1.width, depth: cityW1.height });
  assert.ok(reservedW.length > 0, 'CITYW1 keeps the slots its water sits in');
  for (let i = 0; i < 36; i++) {
    assert.equal(reservedW.includes(i), anyStructureFor(cityW1.levels[0], cityW1.width, startW, 6, i),
      `slot ${i} of CITYW1 reservation disagrees with the skeleton`);
  }
});

test('a whole city assembles from the real archive and decodes', async () => {
  const mif = await data.mif('CITY1.MIF');
  const built = await buildCityLevel({ data, mif, blocksPerSide: 6, seed: 20232 });

  assert.equal(built.slots.length, 36);
  assert.deepEqual(built.missing, [], 'every block of a city-state must exist in the archive');
  assert.equal(built.stats.stamped, 36 - built.reserved.length);
  assert.equal(built.level.flor.length, mif.width * mif.height);

  // The stamp must not have touched the skeleton's wall ring, or the city would
  // have no outside and no gates: this is the check that makes the reconstructed
  // grid start position falsifiable.
  const skeleton = mif.levels[0];
  for (let x = 0; x < mif.width; x++) {
    for (const z of [0, 1, mif.height - 2, mif.height - 1]) {
      assert.equal(built.level.map1[z * mif.width + x], skeleton.map1[z * mif.width + x],
        `wall ring changed at (${x},${z}) — the block grid is misplaced`);
    }
  }

  const inf = await data.inf('TCN.INF');
  const level = decodeLevel(built.level, inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  assert.equal(level.cells.length, mif.width * mif.height);

  const skeletonDecoded = decodeLevel(skeleton, inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  assert.ok(level.stats.wall > skeletonDecoded.stats.wall + 500,
    `a built city must be far more solid than its skeleton (${level.stats.wall} vs ${skeletonDecoded.stats.wall})`);
  // MEASURED, and a format fact worth having: a city has no 0xB door voxels at
  // all. Its buildings are entered through the `0xA` "menu" edges that carry the
  // shop's sign texture, so those are what a city's entrances look like.
  assert.ok(level.stats.edge > 0, 'a city marks its building entrances with menu edges');
  assert.equal(level.stats.door, 0, 'a city has no door voxels — its entrances are menu edges');
  assert.ok(level.stats.entity > 0, 'blocks carry their own entities');
  assert.ok(level.spawn, 'a city needs somewhere to stand');
  assert.ok(level.cells.some((c) => !c.ceiling), 'a city has open sky over its streets');
  assert.ok(level.stats.ceilinged > 0, 'and roofs over its buildings');
});
