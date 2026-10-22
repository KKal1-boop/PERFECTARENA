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

import { HUNT_PROGRESS, HUNT_RUN, HUNT_SECONDS, HUNT_STALL_SECONDS, huntStalled, isHunting, isRoused, stirTheLevel } from '../../src/game/encounters.js';

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
  // A scene with no creatures, or none loaded yet, is not an error. The answer also names the
  // hold it was given and the nearest of the creatures it roused (none, here).
  assert.deepEqual(stirTheLevel([], 10), { roused: 0, nearest: null, hold: HUNT_SECONDS });
  assert.deepEqual(stirTheLevel(undefined, 10), { roused: 0, nearest: null, hold: HUNT_SECONDS });
});

test('only a creature that can reach the sleeper is counted — a promise must be true', () => {
  // The owner, 2026-10-17: *"it just tells you theres people around but they never get close and
  // you dont rest"*. The line used to name every living body in the level, including ones 400 m
  // out that could not arrive before the hold expired. A camp now reaches as far as a run covers
  // (`HUNT_RUN` times the walk, times the hold) and no further.
  const near = { ...spawn(), distance: 40 };
  const far = { ...spawn(), distance: 400 };
  const answer = stirTheLevel([near, far], 100, { reach: 250 });
  assert.equal(answer.roused, 1, 'the one that can arrive is the one announced');
  assert.equal(answer.nearest, 40, 'and the answer says how far off it is');
  assert.equal(near.huntingUntil, 100 + HUNT_SECONDS);
  assert.equal(far.huntingUntil, 0, 'the one that cannot arrive is left standing in its corridor');
  // The scene passes its own reading (`distanceOf`), because it knows where the player stands and
  // the spawn's `distance` is a frame old.
  const scene = { ...spawn() };
  const read = stirTheLevel([scene], 0, { reach: 250, distanceOf: () => 12.5 });
  assert.deepEqual([read.roused, read.nearest], [1, 12.5]);
  // Nothing in reach is a clean camp: no count, no nearest.
  assert.deepEqual(stirTheLevel([{ ...spawn(), distance: 900 }], 0, { reach: 250 }), { roused: 0, nearest: null, hold: HUNT_SECONDS });
  // The reach is the run's own arithmetic — a camp in the country, at the scene's 60 s hold.
  const walk = 2.6;                                  // `interior.js`'s `MONSTER_SPEED`
  assert.ok(HUNT_RUN > 1, 'a hunt is faster than a walk, or it never arrives');
  assert.equal(Math.round(walk * HUNT_RUN * HUNT_SECONDS), 250);
});

test('a hunter that cannot close gives up its trail, and stops being a promise', () => {
  // The second half of the same report: a roused creature barred from the player (a wall, a lake,
  // the courtyard of the ruin it woke in) pressed at the obstruction for the whole hold, staying
  // "on its way" for a minute. Four seconds without closing half a metre and the trail is cold.
  const s = spawn();
  stirTheLevel([s], 0, { hold: 60 });
  const far = 200;
  assert.equal(huntStalled(s, far, 0), false, 'first sighting starts the watch');
  assert.equal(huntStalled(s, far, 3), false, 'three seconds of nothing is not yet a lost trail');
  assert.equal(huntStalled(s, far, HUNT_STALL_SECONDS), true, 'the fourth drops the hunt');
  assert.equal(s.huntingUntil, 0);
  assert.equal(isRoused(s, 1), false);
  // **A hunter that is closing is a hunter.** Half a metre of headway restarts the watch.
  const closing = spawn();
  stirTheLevel([closing], 0, { hold: 60 });
  huntStalled(closing, 100, 0);
  assert.equal(huntStalled(closing, 100 - HUNT_PROGRESS * 2, 3.5), false);
  assert.equal(huntStalled(closing, 100 - HUNT_PROGRESS * 4, 4.5), false, 'still coming, still hunting');
  assert.equal(isRoused(closing, 5), true);
  // A creature with no reading at all is not stalled by a number that is not there.
  assert.equal(huntStalled(spawn(), NaN, 99), false);
  assert.equal(huntStalled(null, 10, 99), false);
});

test('a creature hunts inside its own band whether or not it was roused', () => {
  // The ordinary case, unchanged by this feature: a creature that can see the player nearby
  // comes, roused or not — the four metres inside the band, and the boundary itself.
  assert.equal(isHunting(spawn(), AGGRO, 0, { aggro: AGGRO }), true, 'at the band');
  assert.equal(isHunting(spawn(), AGGRO - 1, 0, { aggro: AGGRO }), true, 'inside it');
});

test('a hunt is a fact about the creature, apart from its own band', () => {
  // **The two halves of `isHunting` are asked separately by the scene**, and this is the half
  // that licenses *walking*: `interior.js` steps a creature that can see the player (its own
  // band) **or** one still hearing a sleep, and a blow still needs sight either way. The
  // distinction is the whole of D-19's live half: gated on `spawn.awake` ("inside my band and I
  // can see you") a roused creature was marked, announced, and then never took a step — measured
  // on a country page 2026-10-17, four roused and their distances byte-identical four seconds
  // later, which is why a clean rest never came.
  const s = spawn();
  assert.equal(isRoused(s, 0), false, 'nothing roused yet');
  stirTheLevel([s], 0, { hold: 30 });
  assert.equal(isRoused(s, 0), true);
  assert.equal(isRoused(s, 30), false, 'the deadline is the deadline');
  // A roused creature beyond its band is hunting **and** roused, while one that was never roused
  // is neither: the scene's own pairing (a hunt walks in, sight only decides the blow), stated
  // here so a change to either half has to face both.
  assert.equal(isHunting(s, 400, 29, { aggro: 34 }), true);
  const stranger = spawn();
  assert.equal(isHunting(stranger, 400, 29, { aggro: 34 }), false);
  assert.equal(isRoused(stranger, 29), false);
  // A creature that was never roused, and one with no clock at all, are ordinary creatures.
  assert.equal(isRoused(spawn(), 5), false);
  assert.equal(isRoused({}, 5), false);
  assert.equal(isRoused(null, 5), false);
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
