// The bolt — ballistics and the windows it may be answered in, pure.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOLT_DAMAGE_SCALE, BOLT_LIFE, BOLT_SPEED, CAST_RANGE, RANGED_IDS,
  boltAtPlayer, castFootwork, resolveBolt, stepBolt,
} from '../../src/game/ranged.js';
import { fireBolt } from '../../src/game/ranged.js';
import { MONSTERS } from '../../src/game/monsters.js';

test('the caster list is the roster this install already names, spelled its way', () => {
  for (const id of RANGED_IDS) {
    assert.notEqual(MONSTERS.find((m) => m.id === id), null, `${id} is in the bestiary`);
  }
  assert.equal(MONSTERS.find((m) => m.id === 'rat') && RANGED_IDS.includes('rat'), false, 'a rat closes');
});

test('a bolt aims at where the player is, at the caster scale of hurt', () => {
  const bolt = fireBolt({ x: 0, y: 2, z: 0 }, { x: 13, y: 1, z: 0 }, { damage: 10 });
  // The direction is the unit bearing times the speed — 13/√170 of thirteen, not thirteen
  // whole, so the assertion is on the *shape* (the normalised bearing) and the speed.
  const bearing = Math.hypot(13, -1, 0);
  assert.ok(Math.abs(bolt.vx - 13 / bearing * BOLT_SPEED) < 0.001, 'x-wise, the bearing times the speed');
  assert.ok(Math.abs(Math.hypot(bolt.vx, bolt.vy, bolt.vz) - BOLT_SPEED) < 0.001, 'and always thirteen a second in all');
  assert.ok(Math.abs(bolt.vy + 1 / bearing * BOLT_SPEED) < 0.001, 'the flight dips at the chest');
  assert.equal(bolt.damage, Math.round(10 * BOLT_DAMAGE_SCALE));
});

test('the bolt flies true and dies on a wall', () => {
  const bolt = fireBolt({ x: 0, y: 2, z: 0 }, { x: 10, y: 2, z: 0 }, { damage: 10 });
  const open = stepBolt(bolt, 0.25, () => false);
  assert.equal(open.dead, false);
  assert.equal(bolt.x, 3.25);
  assert.ok(bolt.life < BOLT_LIFE, 'its sight is spent as it flies');
  const stone = stepBolt(bolt, 0.25, () => true);
  assert.equal(stone.wallhit, true, 'the pillar eats it');
  assert.equal(bolt.life, 0);
});

test('the windows: a dodge flees the bolt, a guard holds a quarter, nothing else lands whole', () => {
  const bolt = { damage: 10 };
  assert.deepEqual(resolveBolt(bolt, { defence: 'dodge' }), { outcome: 'dodged', damage: 0 });
  assert.deepEqual(resolveBolt(bolt, { defence: 'parry' }), { outcome: 'blocked', damage: 3 }, 'a parry is not a sword trick at magic');
  assert.deepEqual(resolveBolt(bolt, { defence: 'block' }), { outcome: 'blocked', damage: 3 });
  assert.deepEqual(resolveBolt(bolt, { defence: 'none' }), { outcome: 'hit', damage: 10 });
});

test('the body: a hit radius and a generous ceiling, because crouching is not a dodge', () => {
  const feet = [10, 0, 10];
  assert.ok(boltAtPlayer({ x: 10.3, y: 1.0, z: 10.3 }, feet));
  assert.ok(!boltAtPlayer({ x: 10.4, y: 1.0, z: 10.4 }, feet), 'past the radius is past the body');
  assert.ok(!boltAtPlayer({ x: 10.3, y: 2.2, z: 10.3 }, feet), 'above the head is above the body');
});

test('footwork is a band, and the place of a caster is in it', () => {
  assert.equal(castFootwork(3.0).walk, -1, 'inside the band a caster walks away');
  assert.equal(castFootwork(8.0).walk, 0, 'in the band a caster holds and casts');
  assert.equal(castFootwork(14.0).walk, 1, 'far from the band a caster closes');
  assert.ok(CAST_RANGE.low > 3.0, 'its own band starts past melee reach');
});
