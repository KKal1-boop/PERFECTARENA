// D-02a / D-01b: the country has creatures and travellers in it.
//
// Both rows are the audit's own (2026-10-15) and the owner's ("normal arena has wilderness while
// in perfectarena you teleport around"): every wilderness climate held **0 people and 0
// creatures**, because `TWN.INF`/`DWN.INF`/`MWN.INF` name no monster of their own and
// `scenes/interior.js` empties the folk list outside a city.
//
// These pins hold the replacement to its own law (`game/wildernessBestiary.js`, whose header
// stamps the table as this project's own because Arena's lived in `A.EXE`, D11):
//
//   * every climate, at every hour of the day, holds **something** — a country empty at three in
//     the morning is the defect, not a design;
//   * every id it names is a real monster of `game/monsters.js` (never a made-up creature);
//   * each list is **weakest-first** by the monster's own level, so `encounters.rosterWindow`'s
//     prefix law still decides how deep a given danger reaches;
//   * night differs from day in every climate, and daylight on a road is never empty;
//   * the counts stay inside their declared ceiling, and are deterministic per seed;
//   * `monsterCountFor`'s wilderness clause answers for the country while leaving every other
//     case of its own law exactly as it was.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WILDERNESS_BESTIARY, WILDERNESS_CLIMATES, WILD_FOLK_MAX, isWildNight, wildernessFolkCount,
  wildernessFolkKinds, wildernessFolkTrades, wildernessPopulation, wildernessRoster,
} from '../../src/game/wildernessBestiary.js';
import { WILDERNESS_MONSTER_COUNT, dangerOf, monsterCountFor, rosterWindow } from '../../src/game/encounters.js';
import { MONSTERS, monsterById } from '../../src/game/monsters.js';
import { CLIMATE_LETTER } from '../../src/game/tables/cityBlocks.js';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

// ── the vocabulary is the project's own ───────────────────────────────────────

test('the three climates are the install\'s own letters, not a second list', () => {
  assert.deepEqual([...WILDERNESS_CLIMATES], Object.keys(CLIMATE_LETTER));
  assert.deepEqual([...WILDERNESS_CLIMATES], ['temperate', 'desert', 'mountain']);
  // …and every one of them has a bestiary row, which is what the roster reads.
  for (const climate of WILDERNESS_CLIMATES) {
    assert.ok(WILDERNESS_BESTIARY[climate], `${climate} has no bestiary`);
    assert.ok(WILDERNESS_BESTIARY[climate].day.length > 0 && WILDERNESS_BESTIARY[climate].night.length > 0,
      `${climate} has an empty half of the day`);
  }
});

test('the day is the sky\'s day: 05:00 to 19:59', () => {
  assert.equal(isWildNight(5), false, 'dawn is the day');
  assert.equal(isWildNight(4), true);
  assert.equal(isWildNight(19), false);
  assert.equal(isWildNight(20), true, 'dark by eight');
  assert.equal(isWildNight(12), false);
  assert.equal(isWildNight(0), true, 'midnight');
  // An hour outside 0…23 wraps rather than landing in the day by accident (a scene that hands
  // over a running hour count is the caller this guards).
  assert.equal(isWildNight(24), true, '24:00 is midnight, not noon');
  assert.equal(isWildNight(29), false, '29:00 is 05:00');
});

// ── the creatures ─────────────────────────────────────────────────────────────

test('every climate, at every hour, holds a real creature', () => {
  // The headline pin: 3 climates × 24 hours, none of them empty, and nothing invented.
  for (const climate of WILDERNESS_CLIMATES) {
    for (const hour of HOURS) {
      const roster = wildernessRoster({ climate, hour, danger: 4 });
      assert.ok(roster.length > 0, `${climate} at ${hour}:00 holds nothing (D-02a)`);
      for (const id of roster) {
        assert.ok(monsterById(id), `${id} is not a monster of this game`);
        assert.ok(MONSTERS.some((m) => m.id === id && m.sprite), `${id} has no art in this install`);
      }
    }
  }
});

test('each roster is the climate\'s own list, weakest-first', () => {
  for (const climate of WILDERNESS_CLIMATES) {
    const day = WILDERNESS_BESTIARY[climate].day;
    const night = WILDERNESS_BESTIARY[climate].night;
    for (const list of [day, night]) {
      const levels = list.map((id) => monsterById(id).level);
      for (let i = 1; i < levels.length; i++) {
        assert.ok(levels[i] >= levels[i - 1], `${climate}: ${list[i]} (level ${levels[i]}) stands after a deeper kind`);
      }
    }
    // **The country hands back its whole list, not a window of it** (2026-10-16). This
    // module used to narrow the list itself with `rosterWindow`, and `spawnEncounter` narrows
    // what it is handed *again*, so a window of a window of a six-kind list was its first
    // entry alone — measured by the audit's climate probe: **`{rat: 4}` on all three
    // climates' day roads, 0 distinct bestiaries**. The window is `rosterWindow`'s one job, at
    // the one place that knows the `depth` of the level (see the block below).
    // The roster is the climate's own list **minus what this install cannot draw** — a creature
    // whose `sprite` is null would be spawned and then silently dropped by the billboard pass.
    // That set is empty since block B24 found the Minotaur's art (`PAT1.CFA`…`PAT6.CFA`), so the
    // filter is a rule with nothing to remove rather than a rule doing quiet work.
    const drawable = (ids) => ids.filter((id) => MONSTERS.some((m) => m.id === id && m.sprite));
    const window = wildernessRoster({ climate, hour: 12 });
    assert.deepEqual(window, drawable(day), `${climate}: the daylight roster is not the climate's own list`);
    assert.deepEqual(wildernessRoster({ climate, hour: 0 }), drawable(night), `${climate}: nor is the night one`);
    const undrawable = day.concat(night).filter((id) => !drawable([id]).length);
    if (undrawable.length) {
      assert.ok(undrawable.every((id) => !window.includes(id)),
        `${climate}: ${undrawable.join(', ')} has no art in this install and is still on the road`);
    }
    // …and the list is still ordered, so the one window that *is* applied stays sound.
    assert.deepEqual(rosterWindow(window, { danger: 40, depth: 0 }), window, 'a full window is the whole list');
    const thin = rosterWindow(window, { danger: 1, depth: 0 });
    assert.ok(thin.length >= 1 && thin.length <= window.length, `${climate}: a thin window is still something`);
    assert.deepEqual(thin, window.slice(0, thin.length), `${climate}: and it is a prefix, never a re-ordering`);
  }
});

test('night is the worse half of the day, in every climate, and it is not the same list', () => {
  for (const climate of WILDERNESS_CLIMATES) {
    const day = wildernessRoster({ climate, hour: 12, danger: 40 });
    const night = wildernessRoster({ climate, hour: 0, danger: 40 });
    assert.notDeepEqual(night, day, `${climate}: nothing changes after dark`);
    assert.ok(night.length > day.length, `${climate}: the night list is not longer`);
    assert.ok(night.every((id) => day.includes(id) || monsterById(id).level >= 8),
      `${climate}: the night adds something a day road would not have`);
  }
  // The two climates the landscape is named for keep their own signature creature, which is the
  // difference the owner asked for by name ("biomes … depending on if its snowing"):
  assert.ok(WILDERNESS_BESTIARY.mountain.day.includes('snowwolf'), 'the mountains have snow wolves');
  assert.ok(!WILDERNESS_BESTIARY.desert.day.includes('wolf'), 'the desert has no wolves');
  assert.ok(WILDERNESS_BESTIARY.desert.night.includes('medusa'), 'and its deep entry is its own');
});

test('danger is what opens the list up, so a first-stage road is not the eighth', () => {
  // The law is applied once, where it belongs: `encounters.rosterWindow`, the same function
  // the dungeons go through, with the danger of the *place*. `wildernessRoster` answers with
  // the climate's own ordered list and lets that one window do the narrowing.
  const list = wildernessRoster({ climate: 'temperate', hour: 12 });
  const early = rosterWindow(list, { danger: dangerOf({ stage: 1 }), depth: 0 });
  const late = rosterWindow(list, { danger: dangerOf({ stage: 8 }), depth: 0 });
  assert.ok(early.length < late.length, `${early.length} kinds on the first stage vs ${late.length} on the last`);
  assert.ok(early.includes('rat') && early.includes('goblin'), early.join(', '));
  assert.ok(!early.includes('minotaur'), 'the deep kinds stay off the early road');
  // At the eighth stage the whole country list is in play, and the window never invents a kind.
  assert.deepEqual(late, list, 'the last stage reaches the whole road');
  assert.ok(early.every((id) => list.includes(id)), 'and every kind the first stage fields is one of them');
  assert.deepEqual(wildernessPopulation({ climate: 'temperate', hour: 12 }).roster, list,
    'and the population call hands the whole list to whoever wires it');
});

// ── the travellers ────────────────────────────────────────────────────────────

test('a road in daylight is never empty, and the count stays inside its ceiling', () => {
  for (const climate of WILDERNESS_CLIMATES) {
    for (const hour of HOURS) {
      for (const seed of [1, 7, 4242, 99991]) {
        const count = wildernessFolkCount({ climate, hour, seed });
        assert.ok(Number.isInteger(count), `${count} is not a count`);
        assert.ok(count >= 0 && count <= WILD_FOLK_MAX, `${climate} at ${hour}:00 holds ${count} people`);
        if (!isWildNight(hour)) assert.ok(count >= 1, `${climate} at ${hour}:00 has an empty road in daylight (D-01b)`);
      }
    }
  }
});

test('the same seed is the same road, and different seeds are different roads', () => {
  const args = { climate: 'temperate', hour: 12, seed: 12345 };
  assert.equal(wildernessFolkCount(args), wildernessFolkCount({ ...args }));
  assert.equal(wildernessFolkCount({ ...args, seed: 1 }), wildernessFolkCount({ ...args, seed: 1 }));
  // Across a sweep the draw really moves, and the two seeds that differ are found rather than
  // asserted from memory — a single pair could agree by chance, a sweep that never moves would
  // mean the seed is not being read at all.
  const counts = new Set();
  for (let seed = 1; seed <= 64; seed++) counts.add(wildernessFolkCount({ climate: 'temperate', hour: 12, seed }));
  assert.ok(counts.size >= 3, `64 seeds produced only ${[...counts].join(',')}`);
  const first = wildernessFolkCount({ ...args, seed: 1 });
  const differing = [...Array(2000).keys()].map((i) => i + 2)
    .find((s) => wildernessFolkCount({ ...args, seed: s }) !== first);
  assert.ok(differing, 'no seed in 2 000 changed the count');
});

test('night is quieter than day, and a night road may be empty', () => {
  // Per climate, summed over every seed and hour of each half: the night total is the smaller.
  const total = (night) => {
    let sum = 0;
    for (const climate of WILDERNESS_CLIMATES) {
      for (const hour of HOURS) {
        if (isWildNight(hour) !== night) continue;
        for (let seed = 1; seed <= 40; seed++) sum += wildernessFolkCount({ climate, hour, seed });
      }
    }
    return sum;
  };
  assert.ok(total(true) < total(false), `night ${total(true)} vs day ${total(false)}`);
});

test('the figures and the trades come from the project\'s own vocabularies', () => {
  // The kind keys are the spellings `peopleKinds.js` derives from the archive's file names
  // (`MLGEN0<set>`, `FMGEN0<set>`, `GUARD0`, `PAT`, `LGLIT0`), never a new id.
  const KIND_SHAPE = /^(MLGEN0[1-5]|FMGEN0[1-5]|GUARD0|PAT|LGLIT0)$/;
  for (const climate of WILDERNESS_CLIMATES) {
    for (const hour of HOURS) {
      const kinds = wildernessFolkKinds({ climate, hour });
      assert.ok(kinds.length > 0);
      for (const key of kinds) assert.match(key, KIND_SHAPE, `${key} is not a family the archive ships`);
      const trades = wildernessFolkTrades({ climate, hour });
      assert.ok(trades.length > 0);
      for (const trade of trades) {
        // `livingWorld.js`'s own role strings (`ROLE_OF` and its day-plan table).
        assert.ok(['townsperson', 'worker', 'merchant', 'monk', 'watch'].includes(trade),
          `${trade} is not a trade this game's day system knows`);
      }
    }
  }
  // A night road draws the watch; a daylight one does not.
  assert.ok(wildernessFolkKinds({ hour: 12 }).some((k) => /^(MLGEN|FMGEN|PAT)/.test(k)));
  assert.equal(wildernessFolkTrades({ hour: 23 })[0], 'watch');
  assert.ok(wildernessFolkKinds({ hour: 0 }).includes('GUARD0'));
});

test('the whole window agrees with its own parts', () => {
  const opts = { climate: 'desert', hour: 21, seed: 77, danger: 8 };
  const window = wildernessPopulation(opts);
  assert.equal(window.count, wildernessFolkCount(opts));
  assert.deepEqual(window.kinds, wildernessFolkKinds(opts));
  assert.deepEqual(window.trades, wildernessFolkTrades(opts));
  assert.deepEqual(window.roster, wildernessRoster(opts));
  assert.ok(window.roster.length > 0 && window.kinds.length > 0 && window.trades.length > 0);
});

// ── the count law, and the one it must not disturb ────────────────────────────

test('a wilderness window holds creatures, and every other case of the count law is untouched', () => {
  const window = { width: 128, depth: 128 };
  // The country: a real number, inside its own declared ends, for the stage-1 and last-stage
  // danger a wilderness is ever given.
  const early = monsterCountFor({ wilderness: true, danger: dangerOf({ stage: 1 }), level: window, monsters: [] });
  const late = monsterCountFor({ wilderness: true, danger: dangerOf({ stage: 8 }), level: window, monsters: [] });
  assert.ok(early >= WILDERNESS_MONSTER_COUNT.min && early <= WILDERNESS_MONSTER_COUNT.max, `${early} creatures`);
  assert.ok(late >= early && late <= WILDERNESS_MONSTER_COUNT.max, `${early} → ${late}`);
  // A window the size of a room — a shrine in a clearing — keeps the room's count.
  assert.equal(monsterCountFor({ wilderness: true, danger: 9, level: { width: 20, depth: 18 }, monsters: [] }),
    WILDERNESS_MONSTER_COUNT.small);

  // **The law the wilderness clause must not have eaten**: a level that names no monster of its
  // own and is not wilderness still gets none (a shop's `.INF`, an inn's, a tavern's).
  assert.equal(monsterCountFor({ monsters: [], danger: 20, level: window }), 0);
  // …and the ordinary ladder is exactly where it was, in numbers.
  // (The ladder's own arithmetic, read off the code that was there before this clause:
  // `6 + floor((danger - 2) / 3)`, clamped to 4…14.)
  assert.equal(monsterCountFor({ danger: 5, level: window }), 7, 'the shallowest dungeon field');
  assert.equal(monsterCountFor({ danger: 20, level: window }), 12);
  assert.equal(monsterCountFor({ danger: 40, level: window }), 14, 'and the deepest');
  assert.equal(monsterCountFor({ danger: 20, level: { width: 20, depth: 18 } }), 2, 'a room still holds two');
  // A caller that names its own creatures keeps its own breed and the danger ladder.
  assert.equal(monsterCountFor({ monsters: ['rat'], danger: 5, level: window }), 7);
});
