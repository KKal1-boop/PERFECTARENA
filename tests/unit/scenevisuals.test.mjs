import test from 'node:test';
import assert from 'node:assert/strict';
import { composeArenaSky } from '../../src/game/arenaSky.js';
import {
  AMBIENT_PARTICLE_LIMIT, fogForLevel, fogTransmission, LEVEL_FOG, nearestSceneLights,
  SceneAtmosphere, sceneLightSources,
} from '../../src/game/sceneLighting.js';

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

test('a dungeon\u2019s air thickens with distance, and a street\u2019s does not', () => {
  // The owner, in the port beside the original: "there is no fog in dungeons". Every enclosed
  // level used to get one density, 0.012, which `exp2` turns into no visible fog at all — 94 %
  // of the light still there at 20 m, 70 % at 50 m.
  const enclosed = fogForLevel({});
  const city = fogForLevel({ outside: true });
  const wild = fogForLevel({ outside: true, wild: true });
  assert.equal(enclosed.kind, 'enclosed');
  assert.equal(city.kind, 'city');
  assert.equal(wild.kind, 'wild');
  assert.ok(enclosed.density > city.density, 'a dungeon is thicker than a street');
  assert.ok(city.density > wild.density, 'and a street thicker than a wood, where the country is the point');

  // The law as light left: near is readable, the far end of a corridor is not.
  assert.ok(fogTransmission(enclosed.density, 5) > 0.9, 'five metres is clear');
  assert.ok(fogTransmission(enclosed.density, 10) > 0.8, 'ten metres is readable');
  assert.ok(fogTransmission(enclosed.density, 30) < 0.3, 'thirty metres is dark');
  assert.ok(fogTransmission(enclosed.density, 50) < 0.05, 'and fifty is gone');
  //…which the old number could not do at any distance a dungeon has.
  assert.ok(fogTransmission(0.012, 50) > 0.6, 'the density this port used to set left 70 % at 50 m');
  assert.ok(fogTransmission(city.density, 30) > 0.9, 'a city still sees across itself');
  assert.ok(fogTransmission(wild.density, 100) > 0.8, 'and the country is visible further still');

  // The air is the level's own, and `?fog=` is the door a probe pins it by.
  assert.equal(fogForLevel({ override: 0 }).density, 0);
  assert.equal(fogForLevel({ override: 0.02 }).density, 0.02);
  assert.equal(fogForLevel({ outside: true, override: 0.02 }).kind, 'city', 'the override moves a number, not the place');
  assert.equal(fogForLevel({}).colour.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(enclosed.colour[i] - LEVEL_FOG.enclosed.colour[i]) < 1e-6, `fog channel ${i}`);
  }
  assert.notStrictEqual(fogForLevel({}).colour, fogForLevel({}).colour, 'a caller cannot write into the table');
  assert.equal(fogForLevel({ override: Number.NaN }).density, LEVEL_FOG.enclosed.density, 'NaN is not an override');
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
