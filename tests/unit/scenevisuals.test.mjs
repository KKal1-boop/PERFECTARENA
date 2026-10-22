import test from 'node:test';
import assert from 'node:assert/strict';
import { composeArenaSky } from '../../src/game/arenaSky.js';
import {
  AMBIENT_PARTICLE_LIMIT, buildingWindowLights, fogForLevel, fogTransmission, LEVEL_FOG,
  nearestSceneLights, SceneAtmosphere, sceneLightSources,
} from '../../src/game/sceneLighting.js';

/**
 * A street with buildings, for the window lights: one door per building, the mass behind it.
 *
 * `buildingWindowLights` reads only what the map carries — a cell's `solid` and its storeys
 * (`upperLayers`) — so a small level is enough to hold the law down, and the install-backed
 * version of it is the city suite's own job (a city is assembled out of block `.MIF`s at load).
 */
function streetWithBuildings(doors, { storeys = 2, mass = true } = {}) {
  // Big enough for the doors it is given: a door off the end of the grid is a door no level has.
  const width = Math.max(5, ...doors.map((d) => d.col + 2));
  const depth = Math.max(5, ...doors.map((d) => d.row + 1));
  const cells = [];
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const isDoor = doors.some((d) => d.row === row && d.col === col);
      const isMass = mass && col === 2;   // the building's mass, right behind the doors at column 1
      cells.push({
        x: row, z: col, floor: { texture: 0, flatIndex: -1, chasm: null },
        kind: isDoor ? 'door' : isMass ? 'wall' : 'air',
        sideTexture: 1, capTexture: -1, bottomTexture: -1, yOffset: 0, ySize: 0, facing: -1,
        doorKind: null, solid: isDoor || isMass, entityFlatIndex: -1, ceiling: true, ceilingTexture: 0,
        upperLayers: isMass ? storeys : 0, rawFlor: 0, rawMap1: 0, rawMap2: 0,
      });
    }
  }
  return { width, depth, floorY: 1, ceilingY: 2, inf: null, cells };
}


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
  // A street's **lantern** is the flame that waits for dark (`sceneLightSources`'s `outdoor`), and it
  // is what this checks now: a doorway is not a light source any more (the owner's *"not the front
  // of the inns"*), so the case that used to be "a door at night" is the lamp at night.
  const sources = sceneLightSources([{ name: 'LANTERN.IMG', row: 1, col: 1, baseY: 3.4 }], [], 2.5, { outdoor: true });
  assert.equal(air.geometry(sources, [0, 2.5, 0]).length, 0, 'an unlit daytime street emits nothing');
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

test('scene lighting uses real sources, filters the night lights by day, and obeys the sixteen-light cap', () => {
  // A dungeon's torch burns whenever it burns; a street's lantern waits for dark. Both are the
  // level's own art, and the difference is the level the caller says it is.
  const torch = { name: 'TORCH.IMG', row: 1, col: 1, baseY: 3.5 };
  const lamp = { name: 'LANTERN.IMG', row: 2, col: 2, baseY: 3.4 };
  const inside = sceneLightSources([torch, lamp]);
  assert.equal(inside.length, 2, 'a dungeon lights both');
  assert.equal(inside.every((l) => !l.nightOnly), true, 'and neither waits for an hour a dungeon does not have');
  const street = sceneLightSources([torch, lamp], [], 2.5, { outdoor: true });
  assert.deepEqual(street.map((l) => l.nightOnly), [false, true], 'the torch burns, the lamp waits');
  assert.equal(nearestSceneLights(street, [5, 2.5, 5]).count, 1, 'by day the street is the torch alone');
  // **The city's own lamp art is a light.** `NLAMP1.DFA` / `NLAMP1DA.IMG` are the street lamps
  // Arena draws in a town; the old FIRE_ART name list left them as dead sprites, so a night
  // street had windows but its lamps were unlit (owner, 2026-10-19).
  for (const name of ['NLAMP1.DFA', 'NLAMP1DA.IMG']) {
    const lamps = sceneLightSources([{ name, row: 1, col: 1, baseY: 3.2 }], [], 2.5, { outdoor: true });
    assert.equal(lamps.length, 1, `${name} is a light source`);
    assert.equal(lamps[0].nightOnly, true, `${name} waits for dark`);
    assert.equal(lamps[0].lamp, true);
  }
  // …and a spell's point light rides the player without disturbing the level's own cap.
  const spell = nearestSceneLights(street, [5, 2.5, 5], { night: true, spellLight: { range: 9 } });
  assert.equal(spell.count, 3, 'the torch, the lamp and the carried spell light');
  assert.ok(spell.positions.some((v, i) => i % 4 === 3 && v === 9), 'the spell light is in the positions');

  // A doorway is not a lamp: thirty doors off a level produce no lights of their own.
  assert.equal(sceneLightSources([], Array.from({ length: 30 }, () => ({ row: 1, col: 1 }))).length, 0,
    'a door is a hole in a wall, not a light in it');

  // **The windows of a town** (`buildingWindowLights`): two warm panes inside the mass behind every
  // building's door, dark by day. Fifteen doors on one street is what fills the sixteen-light cap.
  const doors = Array.from({ length: 15 }, (_, i) => ({ row: i, col: 1 }));
  const windows = buildingWindowLights(streetWithBuildings(doors), doors, { cellSize: 2.5 });
  assert.equal(windows.length, doors.length * 2, 'one pane either side of each door');
  for (const win of windows) {
    assert.equal(win.nightOnly, true, 'a window is a night light');
    assert.equal(win.window, true);
    // …and it is *inside* the building: the mass stands at column 2, whose cells are 5…7.5 m.
    assert.ok(win.z > 5 && win.z < 7.5, `the pane is in the wall, not the street (z=${win.z})`);
    // A window is above the floor plane (1 cell = 2.5 m) and under the ceiling (2 cells = 5 m).
    assert.ok(win.y > 2.5 && win.y < 5, `at window height (y=${win.y})`);
  }
  // A door with no building behind it lights nothing (a dungeon's own doors, and any door onto
  // open air), which is why the pass is asked of a city and not of a level's door count.
  const bare = streetWithBuildings([{ row: 1, col: 1 }], { mass: false });
  assert.equal(buildingWindowLights(bare, [{ row: 1, col: 1 }]).length, 0, 'a door standing in open air lights nothing');
  assert.deepEqual(buildingWindowLights(null, doors), [], 'and no level, no windows');

  const lights = [...sceneLightSources([], [], 2.5, { outdoor: true }), ...windows];
  assert.equal(nearestSceneLights(lights, [0, 2.5, 8]).count, 0, 'a street by day has no night lights at all');
  const night = nearestSceneLights(lights, [0, 2.5, 8], { night: true, carried: true });
  assert.equal(night.count, 16, 'and at night the cap is the engine\'s own sixteen');
  assert.equal(night.positions.length, 64);
  assert.equal(night.colours.length, 48);
  assert.ok([...night.positions, ...night.colours].every(Number.isFinite));
  const dark = nearestSceneLights([], [0, 2.5, 0], { carried: true });
  assert.equal(dark.count, 1);
});
