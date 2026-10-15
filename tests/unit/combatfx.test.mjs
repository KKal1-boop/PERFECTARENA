import test from 'node:test';
import assert from 'node:assert/strict';
import { attackFootprint, fitAttackToGround, insideAttack, CombatFx, FX_MAX_PARTICLES, FX_MAX_VERTICES } from '../../src/game/combatFx.js';
const attack = (charge = false) => ({ origin: { x: 10, y: 2.5, z: 10 }, yaw: 0,
  profile: { reach: 5, charge, windup: 0.6, active: 0.2 }, elapsed: 0.3 });

test('telegraphs stay on their committed ground plane regardless of actor movement or camera', () => {
  const fx = new CombatFx(), a = attack();
  const actor = { monster: { health: 10 }, world: { x: 10, y: 2.5, z: 10 }, attack: a };
  const first = Array.from(fx.geometry([actor], [1, 0, 0]));
  actor.world.x = 100;
  assert.deepEqual(Array.from(fx.geometry([actor], [0, 0, 1])), first);
  for (let i = 1; i < first.length; i += 7) assert.ok(Math.abs(first[i] - 2.535) < 1e-5);
  assert.equal(fx.telegraphs, 1);
});

test('terrain-fitted markers follow the committed floor plane without changing hit geometry', () => {
  const a = attack();
  const collider = { raycast: ([x, y, z]) => y - (2.5 + (x - 10) * 0.2 + (z - 10) * 0.1) };
  fitAttackToGround(a, collider);
  const fx = new CombatFx();
  const vertices = fx.geometry([{ monster: { health: 1 }, attack: a }], [1, 0, 0]);
  for (let i = 0; i < vertices.length; i += 7) {
    assert.ok(Math.abs(vertices[i + 1] - (2.535 + (vertices[i] - 10) * 0.2 + (vertices[i + 2] - 10) * 0.1)) < 1e-5);
  }
  assert.equal(insideAttack(a, 10, 14), true);
  const missing = attack();
  fitAttackToGround(missing, { raycast: () => Infinity });
  assert.equal(missing.ground, undefined);
});

test('charge damage uses the lane actually drawn, not a homing circle', () => {
  const a = attack(true);
  assert.equal(insideAttack(a, 10, 14), true);
  assert.equal(insideAttack(a, 12, 14), false);
  assert.equal(insideAttack(a, 10, 8), false);
  assert.equal(insideAttack(a, 10, 16), false);
  assert.equal(attackFootprint(a).width, 1.6);
});

test('rings exactly describe melee reach and disappear on recovery', () => {
  const fx = new CombatFx(), a = attack();
  const actor = { monster: { health: 1 }, attack: a };
  assert.equal(insideAttack(a, 13, 14), true);
  assert.equal(insideAttack(a, 13.01, 14), false);
  a.elapsed = 1;
  assert.equal(fx.geometry([actor], [1, 0, 0]).length, 0);
});

test('particles have a hard budget and retire; vertex writes are bounded', () => {
  const fx = new CombatFx();
  for (let i = 0; i < 100; i++) fx.burst(0, 1, 0, 'parried', true);
  assert.equal(fx.particles.length, FX_MAX_PARTICLES);
  const actor = { monster: { health: 1 }, attack: attack() };
  const vertices = fx.geometry(Array(100).fill(actor), [1, 0, 0]);
  assert.ok(vertices.length <= FX_MAX_VERTICES * 7);
  assert.ok([...vertices].every(Number.isFinite));
  fx.step(0.6);
  assert.equal(fx.particles.length, 0);
});
