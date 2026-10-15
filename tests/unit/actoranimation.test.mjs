import test from 'node:test';
import assert from 'node:assert/strict';
import { MIRROR_DEADBAND, actorFrame, actorMirrored, mirrorFor, stepActorAnimation } from '../../src/game/actorAnimation.js';

test('actors sharing art have independent strides and a stationary actor always draws frame zero', () => {
  const moving = { world: { x: 0, z: 0 } }, standing = { world: { x: 3, z: 3 } };
  stepActorAnimation(moving); stepActorAnimation(standing);
  moving.world.x = 0.8;
  stepActorAnimation(moving); stepActorAnimation(standing);
  assert.ok(actorFrame(moving, 12) > 0);
  assert.equal(actorFrame(standing, 12), 0);
  assert.equal(moving.facing, Math.PI / 2);
  stepActorAnimation(moving);
  assert.equal(actorFrame(moving, 12), 0);
});

test('teleports do not advance a stride; paused draws are pure', () => {
  const actor = { world: { x: 0, z: 0 } };
  stepActorAnimation(actor);
  actor.world.z = 200;
  stepActorAnimation(actor);
  assert.equal(actorFrame(actor, 12), 0);
  assert.equal(actor.motion.metres, 0);
  const before = JSON.stringify(actor);
  for (let i = 0; i < 100; i++) actorFrame(actor, 12);
  assert.equal(JSON.stringify(actor), before);
});

test('enemy walking only uses 0–5, attacks only use 8–11, and death uses its own sheet', () => {
  const actor = { monster: {}, motion: { moving: true, metres: 0 } };
  for (let i = 0; i < 100; i++) {
    actor.motion.metres = i / 100 * 2.5;
    assert.ok(actorFrame(actor, 12) <= 5, 'walk never plays look or attack frames');
  }
  const attack = { profile: { windup: 0.6, active: 0.3 }, elapsed: 0 };
  assert.equal(actorFrame(actor, 12, { attack }), 8);
  attack.elapsed = 0.3;
  assert.equal(actorFrame(actor, 12, { attack }), 9);
  attack.elapsed = 0.65;
  assert.equal(actorFrame(actor, 12, { attack }), 10);
  attack.elapsed = 0.85;
  assert.equal(actorFrame(actor, 12, { attack }), 11);
  actor.death = { elapsed: 0 };
  assert.equal(actorFrame(actor, 3), 0);
  actor.death.elapsed = 0.09;
  assert.equal(actorFrame(actor, 3), 1);
  actor.death.elapsed = 0.18;
  assert.equal(actorFrame(actor, 3), 2);
  actor.death.elapsed = 100;
  assert.equal(actorFrame(actor, 3), 2, 'corpse holds its final pose');
});

test('camera-relative sides mirror without changing actor yaw', () => {
  assert.equal(actorMirrored(0, 0, 0, -1, 0), true);
  assert.equal(actorMirrored(0, 0, 0, 1, 0), false);
});

// ── the owner's report, 2026-10-16 ─────────────────────────────────────────────
// "ENEMIES FLIP LEFT AND RIGHT FOR NO REASON WHEN THEY MOVE". Two causes, both measured with
// `.scratch/flipprobe.mjs` and both pinned here: a heading read off a single frame of the
// scene's one-axis-at-a-time stepping (259 sharp turns in 300 frames), and a mirrored side
// decided on a sine that is zero for anybody walking straight at the player (238 flips).
// `.scratch/flipprobe.mjs`, before → after: 258 flips → 0, 259 turns → 1.

/** The scene's own step: each axis moved and wall-tested on its own (`interior.js`). */
function stepGame(ex, ez, dx, dz, move, blockedAxis = () => false) {
  const d = Math.hypot(dx, dz) || 1;
  let x = ex, z = ez;
  if (!blockedAxis('x')) x += (dx / d) * move;
  if (!blockedAxis('z')) z += (dz / d) * move;
  return [x, z];
}

test('a creature stepped one axis at a time keeps one heading and one side', () => {
  const EYE = [0, 1.6, 0], SPEED = 1.67, DT = 1 / 60, FRAMES = 300;
  const actor = { monster: {}, world: { x: 10, y: 0, z: 10 }, facing: 0 };
  let prevFacing = null, turns = 0, flips = 0, side = null, refused = 0;
  for (let f = 0; f < FRAMES; f++) {
    const dx = EYE[0] - actor.world.x, dz = EYE[2] - actor.world.z;
    // One axis refused every other frame — what a wall, a door or a body in the way does to
    // one axis of a diagonal approach.
    const block = ((refused++ >> 1) % 2 === 0) ? 'x' : 'z';
    const [x, z] = stepGame(actor.world.x, actor.world.z, dx, dz, SPEED * DT,
      (axis) => axis === block);
    actor.world.x = x; actor.world.z = z;
    stepActorAnimation(actor, { cycleMetres: 2.5, maxStep: Math.max(1, SPEED * DT * 1.5) });
    if (prevFacing !== null) {
      let delta = actor.facing - prevFacing;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      if (Math.abs(delta) > 0.4) turns++;
    }
    prevFacing = actor.facing;
    const now = mirrorFor(actor, EYE[0], EYE[2]);
    if (side !== null && now !== side) flips++;
    side = now;
  }
  // Before the fix this run read 259 sharp turns and 258 mirror flips — the creature and its
  // billboard both vibrating on the spot while it walked.
  assert.ok(turns <= 2, `${turns} sharp turns (>40°) in ${FRAMES} frames of walking`);
  assert.ok(flips <= 2, `${flips} mirror flips in ${FRAMES} frames of walking`);
  // …and the creature really did walk: a refused axis costs it some speed, so the honest
  // claim is how far it closed on the eye, not where it ended.
  const closed = Math.hypot(10, 10) - Math.hypot(actor.world.x - EYE[0], actor.world.z - EYE[2]);
  assert.ok(closed > 3, `closed ${closed.toFixed(2)} m on the eye in ${FRAMES} frames`);
});

test('the side is still decided when it means something: left is not right', () => {
  // Both walk past the player along -z, one on each side. Neither has moved yet when its
  // side is asked for, which is the state a billboard is first drawn in.
  const left = { monster: {}, world: { x: -2, z: 0 }, facing: Math.PI };
  const right = { monster: {}, world: { x: 2, z: 0 }, facing: Math.PI };
  assert.equal(mirrorFor(left, 0, 0), true);
  assert.equal(mirrorFor(right, 0, 0), false);
  // The deadband is a real band, not a rounding of the whole decision.
  assert.ok(MIRROR_DEADBAND > 0 && MIRROR_DEADBAND < 0.5);
  const ahead = { monster: {}, world: { x: 0, z: 6 }, facing: 0 };
  assert.equal(mirrorFor(ahead, 0, 0), false, 'head-on is not mirrored');
});
