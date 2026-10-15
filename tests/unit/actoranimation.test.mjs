import test from 'node:test';
import assert from 'node:assert/strict';
import { actorFrame, actorMirrored, stepActorAnimation } from '../../src/game/actorAnimation.js';

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
