// D-15: whose bestiary stands in a dungeon's first rooms.
//
// The owner's report (2026-10-16), played side by side with the original: "as first enemies you
// fight a lot of goblins rats and then an archer … instead in perfectarena theres a golem then a
// vampire and ghouls". The cause read off the code was a **uniform draw over the level's whole
// `*ITEM` roster**, so the Imperial Dungeons could field a lich beside a rat.
//
// These pins hold the replacement to its own law: the reachable window is a prefix of the
// level's own list (the install's danger order, item 32 rat → item 54 lich), it widens with the
// danger of the place and with depth, and a single-kind roster — a `slay` job's own target — is
// never narrowed at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterWindow, spawnEncounter, dangerOf } from '../../src/game/encounters.js';

/** The Imperial Dungeons' own list, as the 2026-10-15 audit measured it off `start.inf`. */
const START_ROSTER = ['rat', 'goblin', 'lizardman', 'wolf', 'snowwolf', 'orc', 'skeleton',
  'minotaur', 'spider', 'ghoul', 'hellhound', 'ghost', 'zombie', 'troll', 'wraith',
  'homonculus', 'icegolem', 'stonegolem', 'irongolem', 'firedaemon', 'medusa', 'vampire', 'lich'];

/** The deep end of that list: the kinds that must not stand on an entrance level. */
const DEEP = ['stonegolem', 'irongolem', 'firedaemon', 'medusa', 'vampire', 'lich'];

/** A level big enough to hold a field: every cell standable, 40×40. */
function room(size = 40) {
  const cells = [];
  for (let i = 0; i < size * size; i++) cells.push({ solid: false, floor: { texture: 1 } });
  return { width: size, depth: size, cells, cellSize: 1, floorY: 1 };
}

test('a level that names one creature keeps that creature, however shallow', () => {
  // The `slay` path passes exactly the monster its job wants; a window must not eat it.
  assert.deepEqual(rosterWindow(['vampire'], { danger: 2, depth: 0 }), ['vampire']);
  assert.deepEqual(rosterWindow(['goblin'], { danger: 2, depth: 0 }), ['goblin']);
});

test('the window is a prefix of the level\'s own list, never a reordering of it', () => {
  const window = rosterWindow(START_ROSTER, { danger: 5, depth: 0 });
  assert.deepEqual(window, START_ROSTER.slice(0, window.length));
  assert.ok(window.length > 0 && window.length < START_ROSTER.length,
    `${window.length} of ${START_ROSTER.length} kinds`);
});

test('the entrance of a stage-1 dungeon holds goblins and rats, not a golem', () => {
  const window = rosterWindow(START_ROSTER, { danger: dangerOf({ stage: 1 }), depth: 0 });
  for (const deep of DEEP) assert.ok(!window.includes(deep), `${deep} is in the first room`);
  assert.ok(window.includes('rat') && window.includes('goblin'), window.join(', '));
});

test('and a spawn really draws from that window, not from the whole list', () => {
  // The pin has to hold the *spawn*, not only the helper: a caller that forgot to use the
  // window would otherwise pass every check above. 400 draws over the real roster, on the
  // entrance level of a stage-1 dungeon: not one deep kind, and at least two shallow ones.
  const level = room();
  const seen = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const spawned = spawnEncounter({
      level, seed, danger: dangerOf({ stage: 1 }), depth: 0, count: 3,
      arrival: { row: 20, col: 20 }, minCells: 0, monsters: START_ROSTER,
    });
    for (const spawn of spawned) seen.add(spawn.monster.id);
  }
  for (const deep of DEEP) assert.ok(!seen.has(deep), `${deep} was spawned on the entrance level`);
  assert.ok(seen.size >= 2, `only ${[...seen].join(', ')} was ever spawned`);
});

test('a spawn stays in the arrival’s reachable region — and a tube counts as a way through', () => {
  // The owner, 2026-10-19: *"Need reachability validation also when you spawn an enemy in a
  // dungeon, counting places reachable by tubes as reachable"*. Two rooms are otherwise
  // sealed: the near one holds the arrival, the far one is entered **only** through a tube
  // (a solid wall cell whose floor is a chasm), and a third room has no way in at all. An
  // encounter may stand through the tube and never in the sealed room.
  const size = 11;
  const cells = Array.from({ length: size * size }, () => ({ solid: true, floor: { texture: -1 } }));
  const open = (row, col) => { cells[row * size + col] = { solid: false, kind: 'air', floor: { texture: 1 } }; };
  // The arrival's room.
  for (let row = 1; row <= 2; row++) for (let col = 1; col <= 3; col++) open(row, col);
  // The room behind the tube, reachable only through it.
  for (let row = 4; row <= 6; row++) for (let col = 3; col <= 5; col++) open(row, col);
  // The tube: solid stone with a chasm bed, between (2,3) and (4,3) via (3,3).
  cells[3 * size + 3] = { solid: true, kind: 'wall', floor: { texture: 0, chasm: 'dry' } };
  // A sealed room, with no tube and no door.
  for (let row = 1; row <= 2; row++) for (let col = 7; col <= 8; col++) open(row, col);
  const level = { width: size, depth: size, cells, cellSize: 1, floorY: 1 };
  const inSealed = (spawn) => spawn.place.row <= 2 && spawn.place.col >= 7;
  let throughTube = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const spawned = spawnEncounter({
      level, seed, danger: 2, depth: 0, count: 4,
      arrival: { row: 1, col: 1 }, minCells: 0, monsters: ['rat'],
    });
    for (const spawn of spawned) {
      assert.equal(inSealed(spawn), false, `seed ${seed} spawned a rat in the sealed room ${spawn.place.row},${spawn.place.col}`);
      if (spawn.place.row >= 4) throughTube++;
    }
  }
  assert.ok(throughTube > 0, 'no encounter ever used the tube — reachability refused a real way through');
});

test('an encounter is spread across the level, not piled in one room', () => {
  // The owner, 2026-10-19: *"they need to be well spread around dungeons"*. Uniform draws without
  // replacement are not spread: on a level of four corridors a whole encounter can land inside one
  // of them. The rule is a Chebyshev gap between every pair chosen, relaxed only when the floor
  // runs out of room.
  const level = room(40);
  let closest = Infinity;
  let overfull = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const spawned = spawnEncounter({
      level, seed, danger: 2, depth: 0, count: 4,
      arrival: { row: 20, col: 20 }, minCells: 0, monsters: ['rat'],
    });
    assert.equal(spawned.length, 4, `seed ${seed} spawns the whole encounter`);
    for (let i = 0; i < spawned.length; i++) for (let j = i + 1; j < spawned.length; j++) {
      const a = spawned[i].place, b = spawned[j].place;
      const gap = Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
      closest = Math.min(closest, gap);
      if (gap <= 1) overfull++;
    }
  }
  assert.equal(overfull, 0, `no pair stood on neighbouring cells (closest ${closest})`);
  assert.ok(closest > 1, `the closest pair on a 40×40 floor was ${closest} cells apart`);
  // A level with no room to spread still fields the whole encounter: the spread is relaxed, the
  // count is not cut (a `slay` job's four targets must all exist).
  const cramped = { ...room(9), cells: room(9).cells.map((cell, i) => {
    const row = Math.floor(i / 9), col = i % 9;
    return row >= 2 && row <= 6 && col >= 2 && col <= 6 ? cell : { solid: true, floor: { texture: -1 } };
  }) };
  const tight = spawnEncounter({ level: cramped, seed: 3, danger: 2, depth: 0, count: 4, minCells: 0, monsters: ['rat'] });
  assert.equal(tight.length, 4, 'a small room still gives its four');
});

test('a high-level ordinary creature may be the powerful elite: a doubled body and its own loot', () => {
  // Daggerfall's high-level variants, in Arena's own bestiary: the kind does not change, the
  // body is the powerful version of it, and the corpse carries what a person would.
  const level = room(40);
  let elite = null;
  for (let seed = 1; seed <= 200 && !elite; seed++) {
    const spawned = spawnEncounter({
      level, seed, danger: 30, depth: 4, count: 4,
      arrival: { row: 20, col: 20 }, minCells: 0, monsters: ['rat'],
    });
    elite = spawned.find((spawn) => spawn.elite) ?? null;
  }
  assert.ok(elite, 'no elite was rolled in 200 seeds');
  assert.equal(elite.monster.elite, true, 'the monster itself carries the flag the scene paints');
  assert.equal(elite.monster.id, 'rat', 'an elite is the same kind, not a new species');
  assert.ok(elite.monster.maxHealth >= 2, `the elite body is doubled (${elite.monster.maxHealth})`);
  assert.ok(elite.monster.damageMin >= 1, 'and its blow is the stronger one');
  assert.ok(elite.loot && elite.loot.gold >= 1 && elite.loot.items.length > 0,
    `an elite carries loot: ${JSON.stringify(elite.loot)}`);
});

test('the window widens with danger and with depth, and is the whole list at the end', () => {
  const shallow = rosterWindow(START_ROSTER, { danger: 2, depth: 0 }).length;
  const staged = rosterWindow(START_ROSTER, { danger: dangerOf({ stage: 4 }), depth: 0 }).length;
  const deep = rosterWindow(START_ROSTER, { danger: dangerOf({ stage: 4 }), depth: 2 }).length;
  const last = rosterWindow(START_ROSTER, { danger: dangerOf({ stage: 8 }), depth: 4 }).length;
  assert.ok(shallow < staged && staged < deep, `${shallow} → ${staged} → ${deep}`);
  assert.equal(last, START_ROSTER.length, 'the deepest room of the last stage fields all 23');

  // A mutation check, as the engineering law asks: the shape must fail if the window is the
  // whole list at every danger, which is exactly what the defect was.
  const wrong = () => START_ROSTER.length;
  assert.notEqual(wrong({ danger: 2 }), rosterWindow(START_ROSTER, { danger: 2, depth: 0 }).length);
});
