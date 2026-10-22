// CLIMBING AND THE CHASM'S DEPTH — the owner's report of 2026-10-17, held to its laws.
//
//   "in dungeons there should be shallow pits you can climb instead of just holes like in
//    perfectarena and also the water should be deep and you should climb out of it and in
//    perfectarena this is not present, generally the ability to climb is needed"
//
// Two halves, and they are asserted against each other on purpose:
//
//   * **The geometry** (`game/mifMesh.js`): a chasm's bed is a real depth per kind — a dry pit
//     1.2 m, water 1.55 m, lava 1.0 m — where the port used to sink a single 0.45 m shelf so
//     the motor's own step could always walk out. Built through the real mesher on a hand-made
//     level, so the beds are counted in the *mesh*, cell by cell, kind by kind.
//   * **The climb** (`engine/player/motor.js`): `ledgeClimbing` is a capability a host turns
//     on, and when it is on a body presses forward at a lip and hauls itself out — out of a
//     pit, and out of water **measured from the water line**, which is what makes deep water
//     escapable when the bank is above the body's own reach on dry land.
//
// The collider here is a **heightfield stub** — ground height per (x, z), a step ladder of
// `STEP_OFFSET`, and the three ray shapes the motor asks for (forward at a height, down for
// ground, up for headroom). It is small, it is exact, and every law below is a movement the
// motor makes against it; nothing here touches a browser or the install.
//
//   node --test tests/unit/climbing.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHASM_DEPTH, CHASM_DEPTHS, CELL_SIZE, buildLevelMesh, chasmDepthOf,
} from '../../src/game/mifMesh.js';
import { SURFACE_DROP } from '../../src/game/chasmSurface.js';
import {
  CAPSULE_RADIUS, CLIMB_ENTER_WATER_MARGIN, CLIMB_LEDGE_MAX, CLIMB_LEDGE_MAX_WATER, CLIMB_LEDGE_SAMPLE,
  EYE_HEIGHT, PlayerMotor, STEP_OFFSET,
} from '../../src/engine/player/motor.js';

// ── the depths and the body that has to live with them ────────────────────────

test('a chasm is deeper than a step and shallower than the body can climb', () => {
  // The two ends of the law. Below the step the collider's own ladder walks a player out and a
  // climb would be duplicating it; above the reach the pit is a trap rather than a pit.
  for (const [kind, depth] of Object.entries(CHASM_DEPTHS)) {
    assert.ok(depth > STEP_OFFSET,
      `a ${kind} chasm is ${depth} m deep, the motor steps ${STEP_OFFSET} m — it would be a step, not a hole`);
    assert.ok(depth <= CLIMB_LEDGE_MAX,
      `a ${kind} chasm is ${depth} m deep, the body reaches ${CLIMB_LEDGE_MAX} m — it would be a trap`);
  }
  // Water is deeper than a pit: the owner asked for one and the other.
  assert.ok(CHASM_DEPTHS.wet > CHASM_DEPTHS.dry, `water ${CHASM_DEPTHS.wet} is deeper than a pit ${CHASM_DEPTHS.dry}`);
  // …and still shallow enough that a body standing on its bed keeps its head in the air, which
  // is what keeps the scene's own wade (`updateWater`: feet on the bed, eye above) reading as
  // deep water rather than as walking along the bottom.
  assert.ok(CHASM_DEPTHS.wet < EYE_HEIGHT,
    `a wet chasm is ${CHASM_DEPTHS.wet} m deep against a ${EYE_HEIGHT} m eye — the head has to stay clear`);
  // The one-number export is the deepest bed, and an unnamed kind is the dry pit.
  assert.equal(CHASM_DEPTH, CHASM_DEPTHS.wet, 'the single depth a caller asks for is the deepest');
  assert.equal(chasmDepthOf('dry'), CHASM_DEPTHS.dry);
  assert.equal(chasmDepthOf('wet'), CHASM_DEPTHS.wet);
  assert.equal(chasmDepthOf('lava'), CHASM_DEPTHS.lava);
  assert.equal(chasmDepthOf(null), CHASM_DEPTHS.dry, 'a chasm of no named kind is a pit');
  assert.equal(chasmDepthOf('nonsense'), CHASM_DEPTHS.dry);
  // The port's own water is escapable through **either** arm — a body on the bed is within the
  // dry-land reach as well — while the water arm (measured from the surface) is what covers
  // banks above it. The stub test below drives a 2.2 m pool, which only the water arm can
  // leave, and the surface itself is the line it is measured from (`SURFACE_DROP`).
  assert.ok(CHASM_DEPTHS.wet <= CLIMB_LEDGE_MAX, 'the port\'s own water is within the dry-land reach too');
  assert.ok(SURFACE_DROP < CLIMB_LEDGE_MAX_WATER, 'the surface floats under the bank the hands reach over');
});

// ── the mesh: every bed is its own kind's depth ──────────────────────────────

/** One decoded-level cell, in `mifLevel.js`'s own shape (nothing more, nothing less). */
function cell(x, z, chasm) {
  return {
    x, z,
    floor: { texture: chasm ? 0 : 0, flatIndex: -1, chasm: chasm ?? null },
    kind: 'air',
    sideTexture: -1, capTexture: -1, bottomTexture: -1,
    yOffset: 0, ySize: 0, facing: -1, doorKind: null, solid: false,
    stair: null, entityFlatIndex: -1, gateway: false,
    ceiling: false, ceilingTexture: -1, upperLayers: 0, upperRaised: false,
    rawFlor: 0, rawMap1: 0, rawMap2: 0,
  };
}

/** An INF with one floor texture, enough for the mesher to group a bed under. */
const TEST_INF = {
  name: 'TEST.INF',
  voxelTextures: [{ filename: 'TEST.SET', setIndex: 0 }],
  floorTextureCount: 1,
  ceiling: { height: 100, outdoorDungeon: false, textureIndex: 0, boxScale: null },
  levelUpIndex: null, levelDownIndex: null,
  boxSides: [], boxCaps: [], sounds: [], keys: new Map(), riddles: new Map(), loreTexts: new Map(),
};

/**
 * A five-by-five level whose middle row is one chasm kind: a pit, a pool and a lava lake, each
 * with dry ground around it, so the bank a climb has to surmount is the level's own geometry.
 */
function chasmLevel(kind) {
  const width = 5, depth = 5;
  const cells = [];
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) cells.push(cell(col, row, row === 2 ? kind : null));
  }
  return {
    width, depth, cells, inf: TEST_INF,
    floorY: 1, ceilingY: 2, layerCount: 3, ceilingScale: 1,
    outdoors: false, startPoints: [], spawn: { x: 0.5, y: 2, z: 0.5 },
    stats: { air: width * depth, wall: 0, ceilinged: 0, noFloor: 0 },
  };
}

test('every chasm bed in the mesh is the depth its own kind names', () => {
  const surface = 1 * CELL_SIZE;   // floorY 1, the level the fixture decodes at
  for (const kind of ['dry', 'wet', 'lava']) {
    const level = chasmLevel(kind);
    const built = buildLevelMesh(level);
    const chasms = level.cells.filter((c) => c.floor.chasm).length;
    assert.equal(chasms, 5, `${kind}: the fixture's middle row is five cells`);
    assert.equal(built.stats.chasmBeds, chasms, `${kind}: one bed per chasm cell`);
    const { positions, normals, indices } = built.model;
    let beds = 0;
    for (let t = 0; t < indices.length; t += 6) {
      const four = [indices[t], indices[t + 1], indices[t + 2], indices[t + 3], indices[t + 4], indices[t + 5]];
      const ys = [...new Set(four.map((v) => positions[v * 3 + 1]))];
      const up = normals[four[0] * 3 + 1];
      if (ys.length !== 1 || up <= 0.99) continue;
      if (Math.abs(ys[0] - (surface - CHASM_DEPTHS[kind])) < 1e-6) beds++;
    }
    assert.equal(beds, chasms, `${kind}: every bed sits exactly ${CHASM_DEPTHS[kind]} m under the floor`);
    // …and the bed is in the collider as well as the picture: a pit you can see is a pit you fall in.
    assert.ok(built.collider.indices.length > 0, `${kind}: the bed collides`);
  }
});

// ── the motor and its stub collider ──────────────────────────────────────────

/**
 * A **heightfield** collider: `ground(x, z)` is the ground's height, so a wall is a column whose
 * ground stands above the ray, a pit is a column whose ground is below the floor, and the step
 * ladder is `STEP_OFFSET` exactly as the real collider's is.
 */
function heightfield(ground, ceiling = null) {
  const INF = Number.POSITIVE_INFINITY;
  return {
    ground,
    raycast(o, d, max) {
      if (d[1] < -0.99) {                       // down: the ground under the point
        const dist = o[1] - ground(o[0], o[2]);
        return dist >= 0 && dist <= max ? dist : INF;
      }
      if (d[1] > 0.99) {                        // up: a roof, when the fixture names one
        const roof = typeof ceiling === 'function' ? ceiling(o[0], o[2]) : ceiling;
        if (roof === null) return INF;
        const dist = roof - o[1];
        return dist >= 0 && dist <= max ? dist : INF;
      }
      for (let t = 0; t <= max; t += 0.05) {    // forward: a column standing above the ray blocks
        if (ground(o[0] + d[0] * t, o[2] + d[2] * t) > o[1]) return t;
      }
      return INF;
    },
    raycastHit(o, d, max) {
      const dist = this.raycast(o, d, max);
      return { dist, normal: [-d[0], 0, -d[2]], key: 'world:test' };
    },
    move(pos, dx, dy, dz, height, snap = true) {
      const x = pos[0], y = pos[1], z = pos[2];
      let nx = x + dx, nz = z + dz;
      if (ground(nx, nz) > y + STEP_OFFSET + 1e-9) { nx = x; nz = z; }   // the step ladder's own wall
      const g = ground(nx, nz);
      let ny = y + dy;
      let grounded = false;
      if (ny <= g + 1e-9) { ny = g; grounded = true; }
      else if (snap && dy <= 0 && ny - g <= STEP_OFFSET) { ny = g; grounded = true; }
      pos[0] = nx;
      pos[1] = ny;
      pos[2] = nz;
      return { grounded, groundKey: 'world:test', hitCeiling: false };
    },
  };
}

const MOVE = { forward: 1, strafe: 0, run: false, jump: false, up: false, down: false, crouch: false };

/** Step the motor at its own fixed rate, as the game's frame loop does. */
function run(motor, steps, input = MOVE) {
  for (let i = 0; i < steps; i++) motor.update(1 / 60, input, 0);
}

/** Land a freshly placed body: gravity settles it onto the ground before anything is asked. */
function settle(motor) {
  run(motor, 30, { ...MOVE, forward: 0 });
  assert.equal(motor.grounded, true, 'the body settles on the ground');
}

/** A square pit or pool of `depth` metres, in a floor at y = 0, spanning z 1…3.5. */
function pitWorld(depth) {
  return heightfield((x, z) => (x >= 1 && x <= 3.5 && z >= 1 && z <= 3.5 ? -depth : 0));
}

const PIT_CENTRE = [2.25, 2.25];

test('a pit of the meshed depth is a pit: the step cannot leave it, the climb can', () => {
  const depth = CHASM_DEPTHS.dry;
  const collider = pitWorld(depth);
  // A body placed on the pit's bed, facing +z (yaw 0 is forward (0, 0, 1)).
  const motor = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30 });
  motor.spawn(PIT_CENTRE[0], -depth, PIT_CENTRE[1]);
  settle(motor);
  assert.ok(Math.abs(motor.pos[1] + depth) < 1e-6, `the body stands on the bed at ${-depth} m`);

  // The capability is OFF unless a host asks for it, and then the pit holds the body: 1.2 m is
  // above the 0.5 m step, so pressing forward is pressing into the bank.
  assert.equal(motor.ledgeClimbing, false, 'the climb is off until a host turns it on');
  assert.equal(motor._ledgeStep(1 / 60, MOVE, 0), false, 'and no haul starts while it is off');
  assert.equal(motor._ledge, null, 'with nothing latched');
  run(motor, 150);
  assert.ok(motor.pos[1] < -depth + 0.05, `without the climb the body stays on the bed (y ${motor.pos[1].toFixed(2)})`);

  // The probe sees the bank, and the haul takes the body out over it. The key here is the
  // **jump** key with nothing else held: a host whose climb idiom is a press (the scene-side
  // haul) gets the same haul as one whose idiom is a forward press (the skilled machine's),
  // and the climb wins the step, so the press does not jump them 0.5 m into the wall instead.
  motor.ledgeClimbing = true;
  const ledge = motor._ledgeProbe(0);
  assert.ok(ledge, 'the bank in front of the body is a ledge');
  assert.ok(Math.abs(ledge.lip - depth) < 0.06, `the lip is the pit's own depth (${ledge.lip.toFixed(2)} m over the feet)`);
  run(motor, 70, { ...MOVE, forward: 0, jump: true });
  assert.ok(motor.pos[1] >= -0.02, `the climb takes the body out of the pit (y ${motor.pos[1].toFixed(2)})`);
  assert.equal(motor._ledge, null, 'the haul is over, not still running');
  assert.ok(motor.pos[2] > 3.5, `and it is carried past the lip (z ${motor.pos[2].toFixed(2)})`);
  run(motor, 40);   // keys released: the hop a held jump gives stops, and the body settles
  assert.ok(motor.grounded, 'and stands on the bank');
});

test('a body under a roof does not climb through it — crouched or standing', () => {
  // THE TUBE LAW (the owner, 2026-10-19): *"i can still climb out of tuber aka water pits and
  // pits even when im crouched into them"*. A chasm underpass is a pit with a roof one body's
  // height over it; there is a bank in reach, so the old probe called it a ledge and the haul
  // rose through the roof and out of the level. The roof here is 0.5 m over the floor, the bed
  // 1.55 m under it — a tube a crouched body fits inside.
  const depth = CHASM_DEPTHS.wet;
  // The roof covers the **pit** and stops at the bank: the tube is what the body stands in,
  // and the floor past the lip is open air (so the old probe still finds a ledge to take).
  const inPit = (x, z) => x >= 1 && x <= 3.5 && z >= 1 && z <= 3.5;
  const collider = heightfield((x, z) => (inPit(x, z) ? -depth : 0), (x, z) => (inPit(x, z) ? 0.5 : null));
  const motor = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30 });
  motor.spawn(PIT_CENTRE[0], -depth, PIT_CENTRE[1]);
  settle(motor);
  assert.ok(motor.pos[1] < 0, 'the body stands on the tube\'s bed');
  // Walk to the bank first, with the climb still off, so the body is against the lip the old
  // law would have taken. The step ladder cannot surmount 1.55 m, so it stays on the bed.
  run(motor, 150);
  assert.ok(motor.pos[1] < 0, 'the step ladder cannot walk out of the tube');
  assert.equal(motor._ceilingOverhead(), true, 'the roof is over the body: it is in a tube');
  assert.ok(motor._ledgeProbe(0), 'and the bank is still a ledge in reach — the geometry the old law took');
  motor.ledgeClimbing = true;
  run(motor, 90, { ...MOVE, jump: true });
  assert.ok(motor.pos[1] < 0, `the haul is refused under the roof (y ${motor.pos[1].toFixed(2)})`);
  assert.equal(motor._ledge, null, 'and nothing is latched');

  // **Crouched is not a way round it.** The first cut measured the roof from the live crouched
  // capsule, so a crouched body's head was 0.9 m over its feet and the roof over the tube was out
  // of the probe — the exact report. The headroom is always asked of the height the body would
  // stand to, and a crouched body does not haul at all outside water.
  motor.crouching = true;
  run(motor, 90, { ...MOVE, jump: true });
  assert.ok(motor.pos[1] < 0, `a crouched body does not climb out of the tube (y ${motor.pos[1].toFixed(2)})`);
  assert.equal(motor._ledge, null, 'still nothing latched while crouched');
});

test('deep water is climbable from the water line, and only from inside the water', () => {
  // A pool **deeper than the body's dry-land reach**: 2.2 m of water, the surface at the bank.
  // Nothing walks out of it (0.5 m of step cannot climb 2.2) and the dry-land reach cannot
  // either — the hands are at the water line, which is the whole reason the water term exists.
  const depth = 2.2;
  const collider = pitWorld(depth);
  const motor = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30 });
  motor.spawn(PIT_CENTRE[0], -depth, PIT_CENTRE[1]);
  motor.ledgeClimbing = true;
  settle(motor);
  assert.ok(motor.pos[1] < 0, 'the body is in the water');
  assert.equal(motor._inWater(), false, 'with no surface named, the body is not in water at all');
  assert.equal(motor._ledgeProbe(0), null, `a ${depth} m bank is past the ${CLIMB_LEDGE_MAX} m reach on land`);

  // The scene names the surface (`waterSurfaceY`, world y) every frame it holds water.
  motor.waterSurfaceY = 0;
  assert.equal(motor._inWater(), true, `the feet are under the surface by more than ${CLIMB_ENTER_WATER_MARGIN} m`);
  // **The metre figure is a float32.** `motor.pos` is a `Float32Array`, so the bed of a 2.2 m pool
  // is the nearest float32 to −2.2 — 2.2000000476837160 — and the reach comes out 4.8e-8 over the
  // exact figure. The law here is the *line the reach is measured from*, so the tolerance is the
  // float's own; a 1e-9 tolerance failed against a correct implementation.
  assert.ok(Math.abs(motor._ledgeMaxReach() - (depth + CLIMB_LEDGE_MAX_WATER)) < 1e-5,
    `the reach is measured from the water line (${motor._ledgeMaxReach().toFixed(5)} m against ${(depth + CLIMB_LEDGE_MAX_WATER).toFixed(5)})`);
  // The probe is a **reach**, not a sight line: `CLIMB_SIDE_REACH` + `CLIMB_LEDGE_GAP` is 0.6 m,
  // so from the middle of a 2.5 m-wide pool the bank is out of its range and answers `null`. The
  // climb acts on the pair — out of range at the middle, a ledge once the capsule has a press of
  // the bank under it — and it is driven below exactly as the game drives it: `W` held.
  assert.equal(motor._ledgeProbe(0), null,
    'the bank is out of the probe\'s own reach from the middle of the pool');
  const atBank = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30 });
  atBank.ledgeClimbing = true;
  atBank.spawn(PIT_CENTRE[0], -depth, 3.2);   // in the water, a hand's width off the bank
  atBank.waterSurfaceY = 0;
  settle(atBank);
  assert.ok(atBank.pos[1] < 0, `the body is in the water at the bank (y ${atBank.pos[1].toFixed(2)})`);
  const ledge = atBank._ledgeProbe(0);
  assert.ok(ledge, 'and there the bank is a ledge from the water');
  assert.ok(Math.abs(ledge.lip - depth) < 0.06,
    `the lip is the water's own depth over the feet (${ledge.lip.toFixed(2)} m against ${depth})`);
  run(motor, 200);
  assert.ok(motor.pos[1] >= -0.02, `the body climbs out of the water (y ${motor.pos[1].toFixed(2)})`);
  assert.ok(motor.pos[2] > 3.5, `and stands on the bank (z ${motor.pos[2].toFixed(2)})`);

  // The swim mode is the scene's other half of deep water, and the climb still owns the step:
  // `_ledgeStep` runs above the swim/levitate branch, which is what makes "climb out of the
  // water" possible at all — that branch has no vertical input and no gravity.
  // **A swimmer is not a way round it either** (the owner, 2026-10-19: *"i can still climb out
  // of tuber aka water pits and pits even when im crouched into them"*). The swim mode forces
  // the crouched capsule, and a crouched body does not haul — so a body that is *swimming*
  // stays in the water. The climb out of a deep pool is the wading body's (the case above),
  // not the forced-crouch swimmer's.
  const swimmer = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30 });
  swimmer.spawn(PIT_CENTRE[0], -depth, PIT_CENTRE[1]);
  swimmer.ledgeClimbing = true;
  swimmer.waterSurfaceY = 0;
  settle(swimmer);
  swimmer.swimming = true;
  run(swimmer, 200);
  assert.ok(swimmer.pos[1] < 0, `a force-crouched swimmer does not haul out (y ${swimmer.pos[1].toFixed(2)})`);
  assert.equal(swimmer._ledge, null, 'and nothing is latched');
});

test('the level’s edge is not a ledge: the haul asks the host about the ground it would stand on', () => {
  // The owner, 2026-10-19: *"you can still climb out of … whatever and outside the dungeon
  // boundaries"*. A chasm beside the outer wall has a real lip in reach and open air past it,
  // so geometry alone calls it a ledge. The scene names the walkable cells (`canStandAt`), and
  // the probe must refuse a landing it does not answer for.
  const depth = CHASM_DEPTHS.dry;
  const collider = pitWorld(depth);
  const motor = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30 });
  motor.spawn(PIT_CENTRE[0], -depth, 3.2);   // on the bed, at the bank
  motor.ledgeClimbing = true;
  settle(motor);
  assert.ok(motor._ledgeProbe(0), 'the bank is a ledge in reach');
  // The scene's own answer for the cell past the lip: outside the level, not ground.
  motor.canStandAt = () => false;
  assert.equal(motor._ledgeProbe(0), null, 'a landing the host will not stand a body on is not a ledge');
  motor.canStandAt = () => true;
  assert.ok(motor._ledgeProbe(0), 'and the same bank is a ledge again when the cell is ground');
});

test('a bank whose top is a round height over the bed is still a ledge (D-65)', () => {
  // **The real collider's habit, modelled here:** a down-ray that starts exactly ON a surface
  // does not hit it. The scene's collider answers `INF` for a ray whose origin lies in the
  // face it is looking for (measured on START.MIF's own bed), and the ledge probe is a ray cast
  // down at the bank it just found — so a bank whose top falls exactly on the probe's own
  // sample grid (`CLIMB_LEDGE_SAMPLE`, 0.05 m) made the probe answer `null` for every pool in
  // the game. 1.55 m is Arena's own wet-chasm depth (`mifMesh.js`) and 31 of the probe's own
  // 0.05 m samples, so the bank's top lands exactly on a height the scan looks at.
  const depth = CLIMB_LEDGE_SAMPLE * 31;
  const world = heightfield((x, z) => (x >= 1 && x <= 3.5 && z >= 1 && z <= 3.5 ? -depth : 0));
  const meshRaycast = world.raycast;
  world.raycast = (o, d, max) => {
    const dist = meshRaycast(o, d, max);
    // A surface is not hit by the ray that starts on it (`t` is strictly positive).
    return d[1] < -0.99 && Number.isFinite(dist) && dist < 1e-3 ? Number.POSITIVE_INFINITY : dist;
  };
  world.raycastHit = (o, d, max) => ({ dist: world.raycast(o, d, max), normal: [-d[0], 0, -d[2]], key: 'world:test' });
  const motor = new PlayerMotor(world, { speed: 50, running: 30, swimming: 30 });
  motor.ledgeClimbing = true;
  motor.spawn(PIT_CENTRE[0], -depth, 3.2);   // in the water, within the probe's own 0.6 m reach
  motor.waterSurfaceY = 0;   // a pool, as the scene names it
  settle(motor);
  assert.ok(motor.pos[1] < 0, `the body stands on the bed (y ${motor.pos[1].toFixed(3)})`);
  const ledge = motor._ledgeProbe(0);
  assert.ok(ledge, 'the bank is a ledge, though its top is on the probe\'s own sample grid');
  assert.ok(Math.abs(ledge.topY - 0) < 1e-3, `the top it found is the bank's own surface (${ledge.topY.toFixed(4)})`);
  run(motor, 240);
  assert.ok(motor.pos[1] >= -0.02, `and the haul takes the body out (y ${motor.pos[1].toFixed(2)})`);
  assert.ok(motor.pos[2] > 3.5, `standing on the bank (z ${motor.pos[2].toFixed(2)})`);
});

test('a step below the offset is the collider\'s, never the climb\'s', () => {
  // A 0.3 m riser: the fixture's pit at half the step offset. The body crosses it — and the
  // climb takes no part in it, so a host that turns the capability on keeps the ladder's own
  // behaviour for every ordinary step, stair and doorframe in the game.
  const collider = pitWorld(STEP_OFFSET * 0.6);
  const motor = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30 });
  motor.ledgeClimbing = true;
  motor.spawn(PIT_CENTRE[0], -STEP_OFFSET * 0.6, PIT_CENTRE[1]);
  settle(motor);
  assert.equal(motor._ledgeProbe(0), null, 'a face at the step offset is not a ledge');
  run(motor, 120);
  assert.equal(motor._ledge, null, 'the climb never started');
  assert.ok(motor.pos[2] > 3.5, 'the body walked out over the step, as it always did');
  assert.ok(motor.pos[1] >= -0.02, 'and up onto the higher ground');
});

test('the climb is refused by a wall, and never starts in mid-air', () => {
  // A world whose ground steps up 5 m past z 3: a wall, not a ledge. The probe refuses it, so
  // the capability cannot be used to leave a level over its own wall.
  const walled = heightfield((x, z) => (z > 3 ? 5 : 0));
  const motor = new PlayerMotor(walled, { speed: 50, running: 30, swimming: 30 });
  motor.ledgeClimbing = true;
  motor.spawn(0.5, 0, 2.5);
  settle(motor);
  assert.equal(motor._ledgeProbe(0), null, 'a face that carries on above the reach is a wall');
  run(motor, 120);
  assert.ok(motor.pos[1] < 0.05, `the body is against the wall, not on top of it (y ${motor.pos[1].toFixed(2)})`);

  // And a body in the air is not climbing: it falls, lands, and only then may haul itself up.
  const pit = pitWorld(CHASM_DEPTHS.dry);
  const falling = new PlayerMotor(pit, { speed: 50, running: 30, swimming: 30 });
  falling.ledgeClimbing = true;
  falling.spawn(PIT_CENTRE[0], 2, PIT_CENTRE[1]);   // dropped from 2 m over the pit's bed
  falling.update(1 / 60, MOVE, 0);
  assert.equal(falling.grounded, false, 'it starts in the air');
  assert.equal(falling._ledge, null, 'and the climb does not start there');
  run(falling, 200);
  assert.ok(falling.pos[1] >= -0.02, `it lands, and then the climb takes it out (y ${falling.pos[1].toFixed(2)})`);
});

test('a haul is not a fall: the drop into the pit is billed once, and the climb bills nothing', () => {
  const collider = pitWorld(CHASM_DEPTHS.dry);
  const motor = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30 });
  motor.ledgeClimbing = true;
  motor.spawn(PIT_CENTRE[0], 0, 3.9);   // on the bank, one pace from the pit's lip
  settle(motor);
  // Back into the pit (yaw 0: backwards is -z). The drop is billed on the landing, once.
  let billed = 0;
  for (let i = 0; i < 120; i++) {
    motor.update(1 / 60, { ...MOVE, forward: -1 }, 0);
    billed = Math.max(billed, motor.landedFallDistance);
  }
  assert.ok(billed > 1.0 && billed < 1.4,
    `the ${CHASM_DEPTHS.dry} m drop is billed once (${billed.toFixed(2)} m)`);
  assert.ok(motor.pos[1] < -1.0, `and the body is on the pit's bed (y ${motor.pos[1].toFixed(2)})`);
  // Out again: the haul carries the fall anchor with it, so no landing is invented on the way up.
  let during = 0;
  for (let i = 0; i < 200; i++) {
    motor.update(1 / 60, MOVE, 0);
    during = Math.max(during, motor.landedFallDistance);
  }
  assert.ok(motor.pos[1] >= -0.02, `the climb takes it out (y ${motor.pos[1].toFixed(2)})`);
  assert.equal(during, 0, 'and no fall is billed while it hauls itself up');
});
