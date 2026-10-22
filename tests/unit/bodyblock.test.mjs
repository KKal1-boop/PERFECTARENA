// BODY BLOCK — the law the player's step and a creature's approach share.
//
// The owner, 2026-10-21: *"enemies have no collision with the player and so you can pass
// trough them and they never block your way making it basically optional to fight"*.
// `game/bodyBlock.js` is the circle law the scene applies after both steps; these checks
// pin it without a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pushOutOfBodies, withinBody } from '../../src/game/bodyBlock.js';

test('a point inside a body is put back on its rim, never further', () => {
  const body = { x: 10, z: 10 };
  const gap = 0.77;
  const out = pushOutOfBodies({ x: 10.2, z: 10 }, [body], gap);
  assert.equal(out.pushed, true);
  assert.ok(Math.abs(Math.hypot(out.x - body.x, out.z - body.z) - gap) < 1e-9, `${out.x},${out.z}`);
  assert.ok(out.x > 10, 'pushed away from the body, on the side the player came from');
  assert.equal(out.z, 10);
});

test('a point outside every body is left exactly where it is', () => {
  const out = pushOutOfBodies({ x: 0, z: 0 }, [{ x: 2, z: 0 }], 0.77);
  assert.deepEqual(out, { x: 0, z: 0, pushed: false });
});

test('a correction that would land in a wall is refused, not taken', () => {
  // A body against a wall: the only way out of its chest is into the stone. The player keeps
  // the overlap rather than being pushed through the wall — the same law D-47 gave people.
  const out = pushOutOfBodies({ x: 0.2, z: 0 }, [{ x: 0, z: 0 }], 0.77, (x) => x < 0.4);
  assert.equal(out.pushed, false);
  assert.deepEqual([out.x, out.z], [0.2, 0]);
});

test('a point exactly on a body centre is pushed along x, since no side is preferred', () => {
  const out = pushOutOfBodies({ x: 5, z: 5 }, [{ x: 5, z: 5 }], 1);
  assert.equal(out.pushed, true);
  assert.ok(Math.abs(out.x - 6) < 1e-9 && Math.abs(out.z - 5) < 1e-9, `${out.x},${out.z}`);
});

test('withinBody is the approach gate a creature\'s step reads', () => {
  assert.equal(withinBody({ x: 0, z: 0 }, { x: 0.5, z: 0 }, 0.77), true);
  assert.equal(withinBody({ x: 0, z: 0 }, { x: 0.9, z: 0 }, 0.77), false);
  assert.equal(withinBody(null, { x: 0, z: 0 }, 0.77), false);
});
