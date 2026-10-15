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
