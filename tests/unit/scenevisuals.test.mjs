import test from 'node:test';
import assert from 'node:assert/strict';
import { composeArenaSky } from '../../src/game/arenaSky.js';
import { AMBIENT_PARTICLE_LIMIT, nearestSceneLights, SceneAtmosphere, sceneLightSources } from '../../src/game/sceneLighting.js';

test('dynamic sky indices never paint VGA debug colours and ordinary art remains visible', () => {
  const palette = { rgb: new Uint8Array(768) };
  for (let i = 1; i <= 8; i++) palette.rgb.set([255, 0, 255], i * 3);
  const bare = composeArenaSky({ palette });
  const art = { width: 8, height: 1, indices: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) };
  const sky = composeArenaSky({ palette, mountains: [art] });
  assert.deepEqual(sky.colors, bare.colors);
});

test('ambient fire and dust are bounded, deterministic, and disabled in clear outdoor air', () => {
  const air = new SceneAtmosphere();
  const sources = sceneLightSources([], Array.from({ length: 100 }, () => ({ row: 0, col: 0 })));
  assert.equal(air.geometry(sources, [0, 2.5, 0]).length, 0, 'unlit daytime doors emit nothing');
  const opts = { seconds: 3, night: true, carried: true };
  const first = Array.from(air.geometry(sources, [0, 2.5, 0], opts));
  assert.ok(air.fx.particles.length > 24);
  assert.ok(air.fx.particles.length <= AMBIENT_PARTICLE_LIMIT);
  assert.ok(first.every(Number.isFinite));
  assert.deepEqual(Array.from(air.geometry(sources, [0, 2.5, 0], opts)), first, 'paused paint is pure');
  assert.notDeepEqual(Array.from(air.geometry(sources, [0, 2.5, 0], { ...opts, seconds: 4 })), first);
  assert.equal(air.geometry(sources, [0, 2.5, 0], { ...opts, enabled: false }).length, 0);
});

test('scene lighting uses real sources, filters daytime door lights, and obeys sixteen-light cap', () => {
  const doors = Array.from({ length: 30 }, (_, i) => ({ row: i, col: 0 }));
  const lights = sceneLightSources([{ name: 'TORCH.IMG', row: 1, col: 1, baseY: 3.5 }], doors);
  assert.equal(nearestSceneLights(lights, [0, 2.5, 0]).count, 1);
  const night = nearestSceneLights(lights, [0, 2.5, 0], { night: true, carried: true });
  assert.equal(night.count, 16);
  assert.equal(night.positions.length, 64);
  assert.equal(night.colours.length, 48);
  assert.ok([...night.positions, ...night.colours].every(Number.isFinite));
  const dark = nearestSceneLights([], [0, 2.5, 0], { carried: true });
  assert.equal(dark.count, 1);
});
