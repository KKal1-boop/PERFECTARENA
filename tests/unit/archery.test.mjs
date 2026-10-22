// THE BOW — the player's own missile (`src/game/archery.js`).
//
// The owner, 2026-10-18: *"we need all the weapons like axes flails and armor and spells
// actually working"*. Measured against this checkout before the pass: the scene's `strike()`
// resolved **every** weapon through `combat.js`'s `resolveAttack` at a sword's reach, so a long
// bow was a club — and this install does not even ship `BOW.CIF`, so it was a club with no
// picture. The arrow is what makes the family a weapon.
//
// These pins are the flight's own law, in bare Node: where a shot starts, which way it goes,
// what stone does to it, and which creature's body a shaft is inside. The wound is *not* here
// on purpose — it is `combat.js`'s `resolveAttack`, at the moment the arrow lands, so a bow's
// hit chance and a sword's are the same law (and the browser suite holds that end).

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARROW_DROP, ARROW_LIFE, ARROW_RADIUS, ARROW_SPEED, BOW_IDS, aimFromAngles, arrowAtMonster,
  isBow, looseArrow, stepArrow,
} from '../../src/game/archery.js';
import { WEAPONS, materialById, weaponById } from '../../src/game/combat.js';
import { familyOfWeapon } from '../../src/game/weaponView.js';

test('a bow is a bow and nothing else is', () => {
  // Arena's own table has two (`Arena:Base Weapons`, 2–8 and 2–12).
  assert.deepEqual([...BOW_IDS].sort(), ['long-bow', 'short-bow']);
  for (const id of BOW_IDS) assert.equal(isBow(id), true, id);
  assert.equal(isBow('Long-Bow'), true, 'the id is folded like every other weapon id');
  for (const weapon of WEAPONS.filter((w) => !BOW_IDS.includes(w.id))) {
    assert.equal(isBow(weapon.id), false, `${weapon.id} is not a bow`);
  }
  assert.equal(isBow(null), false);
  assert.equal(isBow('a-rusty-spoon'), false);
  // …and every base still maps to a first-person family, so nothing became unwieldable.
  for (const weapon of WEAPONS) assert.ok(familyOfWeapon(weapon.id), weapon.id);
});

test('a shot leaves the eye along the aim, at the arrow’s own speed', () => {
  const arrow = looseArrow({
    from: { x: 1, y: 1.7, z: 2 },
    aim: { x: 0, y: 0, z: 4 },             // an un-normalised aim is still an aim
    weapon: 'long-bow',
    material: 'steel',
  });
  assert.deepEqual([arrow.x, arrow.y, arrow.z], [1, 1.7, 2]);
  assert.equal(Math.round(Math.hypot(arrow.vx, arrow.vy, arrow.vz)), ARROW_SPEED);
  assert.ok(Math.abs(arrow.vz - ARROW_SPEED) < 1e-9, 'a +z aim flies at +z');
  assert.equal(arrow.life, ARROW_LIFE);
  assert.equal(arrow.weapon, 'long-bow');
  assert.equal(arrow.material, 'steel');

  // A missing aim is still a shot, and it does not divide by zero.
  const fallback = looseArrow({ from: { x: 0, y: 0, z: 0 } });
  assert.ok(Number.isFinite(fallback.vx) && Number.isFinite(fallback.vz));
  assert.equal(fallback.weapon, 'short-bow', 'the ordinary bow is the default');
});

test('the camera’s yaw is the aim, and a level shot stays level', () => {
  const north = aimFromAngles(0);
  assert.deepEqual([Math.round(north.x), Math.round(north.y), Math.round(north.z)], [0, 0, 1]);
  const east = aimFromAngles(Math.PI / 2);
  assert.deepEqual([Math.round(east.x), Math.round(east.y), Math.round(east.z)], [1, 0, 0]);
  // The crosshair is the sight: a level aim has no climb, whatever the yaw.
  for (const yaw of [0.3, 1.1, 2.4, 5.9]) assert.equal(aimFromAngles(yaw).y, 0);
  // A caller with a pitch gets a climb, and the vector stays a unit vector.
  const up = aimFromAngles(1.0, 0.4);
  assert.ok(Math.abs(Math.hypot(up.x, up.y, up.z) - 1) < 1e-9);
  assert.ok(up.y > 0);
});

test('the shaft flies straight, falls a little, and dies on stone', () => {
  const wall = { x: 5, z: 0 };
  const solid = (x) => x >= wall.x;
  const arrow = looseArrow({ from: { x: 0, y: 1.7, z: 0 }, aim: { x: 1, y: 0, z: 0 } });
  const startY = arrow.y;

  // A tenth of a second: it has travelled `ARROW_SPEED / 10` metres and dropped.
  const step = stepArrow(arrow, 0.1, solid);
  assert.equal(step.dead, false);
  assert.ok(Math.abs(arrow.x - ARROW_SPEED * 0.1) < 1e-6);
  assert.ok(arrow.y < startY, 'the drop bends the flight');
  assert.ok(startY - arrow.y < 0.1, `the drop is small enough to aim through: ${startY - arrow.y}`);
  assert.ok(ARROW_DROP > 0);

  // It crosses the wall and dies there, and says it was the wall.
  let result = step;
  for (let i = 0; i < 40 && !result.dead; i++) result = stepArrow(arrow, 0.02, solid);
  assert.equal(result.dead, true);
  assert.equal(result.wallhit, true);
  assert.equal(arrow.life, 0, 'a spent arrow has no life left');
});

test('an arrow that meets nothing runs out of flight, not of world', () => {
  const arrow = looseArrow({ from: { x: 0, y: 1.7, z: 0 }, aim: { x: 0, y: 0, z: 1 } });
  let result = { dead: false };
  let frames = 0;
  while (!result.dead && frames < 1000) { result = stepArrow(arrow, 1 / 60, () => false); frames++; }
  assert.equal(result.dead, true);
  assert.equal(result.wallhit, false);
  // The life is spent a frame at a time in floating point, so the count is the ceiling of the
  // life in frames and never more than one frame over it.
  assert.ok(Math.abs(frames - ARROW_LIFE * 60) <= 1, `${frames} frames of flight`);
  // …and it really went somewhere: the flight is the speed times the life, less the drop.
  assert.ok(arrow.z > 30, `flew ${arrow.z.toFixed(1)} m`);
});

test('a shaft is inside a body, not beside it', () => {
  const arrow = { x: 1, y: 1.2, z: 2 };
  const feet = { x: 1, y: 0.2, z: 2 };
  assert.equal(arrowAtMonster(arrow, feet), true, 'chest height, dead on');
  // A body is a cylinder about the feet: beside it misses, over the head misses, under it misses.
  assert.equal(arrowAtMonster(arrow, { ...feet, x: feet.x + ARROW_RADIUS + 0.01 }), false);
  assert.equal(arrowAtMonster(arrow, { ...feet, y: feet.y + 2.5 }), false);
  assert.equal(arrowAtMonster(arrow, { ...feet, y: feet.y + 1.5 }), false, 'a body whose feet are above the shaft');
  // The radius is the bolt cylinder's own order of size (a shaft, not a spark).
  assert.ok(ARROW_RADIUS >= 0.4 && ARROW_RADIUS <= 0.7);
  assert.equal(arrowAtMonster(null, feet), false);
  assert.equal(arrowAtMonster(arrow, null), false);
});

test('the wound a bow rolls is the fight’s own — the base and the metal travel with the shaft', () => {
  // The arrow carries ids, not numbers: the landing call is `resolveAttack`, so a silver arrow
  // doubled at a vampire and an iron one refused by an iron golem are the same rules a sword
  // meets (`tests/unit/combat.test.mjs` holds those; this holds that the bow *has* them).
  const bow = weaponById('long-bow');
  assert.deepEqual([bow.min, bow.max], [2, 12]);
  const ebony = materialById('ebony');
  assert.deepEqual([ebony.min, ebony.max], [5, 5]);
  const arrow = looseArrow({
    from: { x: 0, y: 0, z: 0 }, aim: { x: 0, y: 0, z: 1 }, weapon: bow.id, material: ebony.id,
  });
  assert.equal(weaponById(arrow.weapon).id, 'long-bow');
  assert.equal(materialById(arrow.material).id, 'ebony');
  // A bow's range is what the family adds; reach is the scene's, not this module's.
  assert.equal(Object.hasOwn(arrow, 'range'), false);
});
