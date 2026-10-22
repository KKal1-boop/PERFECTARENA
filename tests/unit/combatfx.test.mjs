import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attackFootprint, fitAttackToGround, insideAttack, CombatFx, FX_MAX_PARTICLES, FX_MAX_VERTICES,
  MAGIC_COLOURS, MAGIC_MOTES,
} from '../../src/game/combatFx.js';
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

test('a cast throws motes of its own element, and the pool stays bounded', () => {
  // The owner, 2026-10-18: *"particles for magic and working magic"*. A spell used to work and
  // leave no mark on screen at all; `magicBurst` is its tell.
  const fire = new CombatFx();
  assert.equal(fire.magicBursts, 0);
  const motes = fire.magicBurst(1, 1, 2, { element: 'fire', power: 9 });
  assert.ok(motes >= MAGIC_MOTES.min && motes <= MAGIC_MOTES.max, `${motes} motes`);
  assert.equal(fire.particles.length, motes);
  assert.deepEqual(fire.particles[0].colour, [...MAGIC_COLOURS.fire]);
  assert.equal(fire.magicBursts, 1);
  // A landed cast is aimed at the wound (a cone), a self cast is an even ring.
  const aimed = new CombatFx().magicBurst(0, 0, 0, { element: 'fire', dir: [0, 1] });
  const ring = new CombatFx().magicBurst(0, 0, 0, { element: 'fire' });
  assert.equal(aimed, ring, 'the same number of motes either way');
  const spreadOf = (opts) => {
    const fx = new CombatFx();
    fx.magicBurst(0, 0, 0, { element: 'fire', ...opts });
    return fx.particles.map((p) => Math.atan2(p.vx, p.vz));
  };
  const cone = spreadOf({ dir: [0, 1] });
  const even = spreadOf({});
  assert.ok(Math.max(...cone.map(Math.abs)) <= 0.9, 'the cone stays in front of the wound');
  assert.ok(Math.max(...even.map(Math.abs)) > 2, 'the ring goes all the way round the caster');
  // An element nobody knows is the spell's own violet, not nothing at all.
  const unknown = new CombatFx();
  assert.ok(unknown.magicBurst(0, 0, 0, { element: 'shadow' }) > 0);
  assert.deepEqual(unknown.particles[0].colour, [...MAGIC_COLOURS.magic]);
  // `step` retires them like every other mote, and the hard ceiling holds under a spam of casts.
  const flood = new CombatFx();
  for (let i = 0; i < 200; i++) flood.magicBurst(0, 1, 0, { element: 'shock', power: 40 });
  assert.equal(flood.particles.length, FX_MAX_PARTICLES);
  assert.equal(flood.magicBursts, 200, 'and every cast counted');
  flood.step(MAGIC_MOTES.life + 0.1);
  assert.equal(flood.particles.length, 0);
  // A position that is not a number throws nothing at all.
  const nowhere = new CombatFx();
  assert.equal(nowhere.magicBurst(NaN, 0, 0), 0);
  assert.equal(nowhere.magicBursts, 0);
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
