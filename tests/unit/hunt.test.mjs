// A SLEEP IN A DUNGEON IS HEARD — the level comes to the sleeper.
//
// The owner, playing both games side by side (2026-10-16): *"resting spawns enemies or moves
// enemies to you in normal arena and perfectarena doesnt"*. Two laws are in that sentence and
// they are tested here, apart from the scene that owns the clock:
//
//   * **rousing** (`stirTheLevel`) — a camp in a dungeon puts the level's living creatures on
//     the player: each one is given a deadline (`huntingUntil`), and a corpse is not. The
//     deadline is a *max*, so a creature roused twice keeps the later one rather than having
//     its hunt cut short by a second sleep;
//   * **hunting** (`isHunting`) — a creature's own band still works exactly as it did (this is
//     the `AGGRO` case, and the numbers below are read off the scene's constant), and beyond it
//     a roused creature keeps coming until its deadline passes. After that it is an ordinary
//     creature standing somewhere in a corridor again.
//
// What is *not* here is the original's own roll — the chance, the hours and the wake-up call
// are `A.EXE`'s and this data set does not ship it (D11). `encounters.js` says so in its own
// header rather than dressing a project rule as the game's.

import test from 'node:test';
import assert from 'node:assert/strict';

import { HUNT_SECONDS, isHunting, stirTheLevel } from '../../src/game/encounters.js';

/** A live spawn at a distance, as the scene holds them. */
const spawn = (health = 8, huntingUntil = 0) => ({ monster: { health }, huntingUntil, world: { x: 0, y: 0, z: 0 } });

/** The scene's own aggro band (`interior.js`'s `AGGRO`). */
const AGGRO = 34;

test('a camp in a dungeon puts every living creature on the player', () => {
  const alive = [spawn(), spawn(), spawn()];
  const { roused } = stirTheLevel(alive, 100);
  assert.equal(roused, 3);
  for (const s of alive) assert.equal(s.huntingUntil, 100 + HUNT_SECONDS, 'and each one for the same hold');
  // **A corpse hears nothing.** Clearing a level and then camping in it is safe, which is what
  // makes the risk of a camp a thing the player can decide about.
  const corpse = spawn(0);
  const down = { ...spawn(), down: true };
  assert.equal(stirTheLevel([corpse, down], 100).roused, 0);
  assert.equal(corpse.huntingUntil, 0);
});

test('the hunt is never shortened, and it starts from the clock it was given', () => {
  const roused = spawn(8, 1000);
  stirTheLevel([roused], 100, { hold: 60 });
  assert.equal(roused.huntingUntil, 1000, 'an earlier deadline cannot cut off a hunt already running');
  const fresh = spawn();
  stirTheLevel([fresh], 0);
  assert.equal(fresh.huntingUntil, HUNT_SECONDS, 'and a hold of no length is no hunt at all');
  const nothing = spawn();
  stirTheLevel([nothing], 50, { hold: 0 });
  assert.equal(nothing.huntingUntil, 50, 'a five-second hold expires at once');
  // A scene with no creatures, or none loaded yet, is not an error.
  assert.deepEqual(stirTheLevel([], 10), { roused: 0 });
  assert.deepEqual(stirTheLevel(undefined, 10), { roused: 0 });
});

test('a creature hunts inside its own band whether or not it was roused', () => {
  // The ordinary case, unchanged by this feature: a creature that can see the player nearby
  // comes, roused or not — the four metres inside the band, and the boundary itself.
  assert.equal(isHunting(spawn(), AGGRO, 0, { aggro: AGGRO }), true, 'at the band');
  assert.equal(isHunting(spawn(), AGGRO - 1, 0, { aggro: AGGRO }), true, 'inside it');
});

test('a roused creature comes from the far side of the level, until its deadline', () => {
  const far = 400;                                   // the level is 64 cells wide
  const s = spawn();
  assert.equal(isHunting(s, far, 0, { aggro: AGGRO }), false, 'before the sleep, it is standing in a corridor');
  stirTheLevel([s], 0, { hold: 30 });
  assert.equal(isHunting(s, far, 0, { aggro: AGGRO }), true, 'a sleep it heard is a hunt, however far it is');
  assert.equal(isHunting(s, far, 29.9, { aggro: AGGRO }), true);
  assert.equal(isHunting(s, far, 30, { aggro: AGGRO }), false, 'and the deadline is a deadline');
  // A creature with no clock at all (every spawn before this feature, and every fixture) is an
  // ordinary creature rather than an error.
  assert.equal(isHunting({}, far, 5, { aggro: AGGRO }), false);
  assert.equal(isHunting(null, far, 5, { aggro: AGGRO }), false);
});
