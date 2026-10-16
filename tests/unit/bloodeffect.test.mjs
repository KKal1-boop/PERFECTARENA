// BLOOD, NOT SPARKS — the spray in the air and the mark on the floor.
//
// The owner, playing this port beside the original (2026-10-16): *"perfectarena has ugly battle
// particles that instead normal arena doesnt have but it has its own blood particles"*. Two laws
// are checked here, and neither is a snapshot:
//
//   * **the spray** (`combatFx.blood`) — Arena's own red, a band of 6–12 particles that grows
//     with the blow's power and stops growing at the band's top, a fan when the scene knows which
//     way the blood was driven, and a position that is not a number emitting nothing at all;
//   * **the marks** (`bloodEffect.bloodDecalsFor`) — the engine's own laws are the source, so
//     every count below is computed by calling `bloodDecals.js` rather than written down twice:
//     `sprayCount(bloodRate(damage, maxHealth))` marks for an ordinary blow, the burst's own
//     drops *beside* them for an overkill, the whole set inside `BLOOD_DECAL_BUDGET`, the record's
//     fields exactly the names `createBloodDecalPool().place(point, normal, {…})` takes, no NaN
//     anywhere in a set, and a bloodless creature marking nothing.
//
// What this file cannot check is that a *page* draws them: the scene's call and the renderer's
// decal pass are the coordinator's wiring (`docs/PORT_BLOCKS.md` rule 5 — a block needs both).

import test from 'node:test';
import assert from 'node:assert/strict';

import { BLOOD_COLOUR, BLOOD_PARTICLES, CombatFx, FX_MAX_PARTICLES } from '../../src/game/combatFx.js';
import { BLOOD_DECAL_BUDGET, BLOOD_DECAL_TINT, bloodDecalReport, bloodDecalsFor } from '../../src/game/bloodEffect.js';
import {
  bloodRate, burstCount, isOverkill, sprayCount,
} from '../../src/engine/combat/bloodDecals.js';

/** A blow of `damage` out of `maxHealth`, as the scene would report one. */
const blow = (damage, maxHealth, extra = {}) =>
  bloodDecalsFor({ x: 4, y: 1, z: -2, damage, maxHealth, seed: 7, ...extra });

// ── the spray in the air ──────────────────────────────────────────────────────

test('a landed blow sprays Arena\'s own blood, and never more than the band', () => {
  const fx = new CombatFx();
  const one = fx.blood(1, 1, 2);
  assert.equal(one, BLOOD_PARTICLES.min, 'a blow at power 1 is the band\'s floor');
  assert.equal(fx.bloodSprays, 1);
  const colours = new Set(fx.particles.map((p) => p.colour.join(',')));
  assert.deepEqual([...colours], [BLOOD_COLOUR.join(',')], 'and every drop is the one red');
  assert.deepEqual([...BLOOD_COLOUR], [0.55, 0.06, 0.05], 'which is the D-20 row\'s own value');

  // Power grows the spray, and the band's top is a top: the same blow at three times the power
  // is not three times the blood.
  const heavy = new CombatFx().blood(0, 0, 0, { power: 3 });
  const huge = new CombatFx().blood(0, 0, 0, { power: 40 });
  assert.ok(heavy > one, `power grows the spray (${one} → ${heavy})`);
  assert.ok(heavy <= BLOOD_PARTICLES.max && huge === BLOOD_PARTICLES.max,
    `and stops at ${BLOOD_PARTICLES.max} (${heavy}, ${huge})`);

  // The pool's own ceiling wins over anything asked of it: two hundred sprays cannot put more
  // than `FX_MAX_PARTICLES` drops in the air, which is what the browser suites bound.
  const flood = new CombatFx();
  for (let i = 0; i < 200; i++) flood.blood(0, 0, 0, { power: 40 });
  assert.equal(flood.particles.length, FX_MAX_PARTICLES);
  assert.equal(flood.bloodSprays, 200, 'and every one of them counted');

  // A position that is not a number is a wound in no world: nothing sprayed, nothing counted.
  const nowhere = new CombatFx();
  assert.equal(nowhere.blood(NaN, 0, 0), 0);
  assert.equal(nowhere.particles.length, 0);
  assert.equal(nowhere.bloodSprays, 0);
});

test('the spray goes where the blow drove it, and spreads as a ring when nobody knows', () => {
  const aimed = new CombatFx();
  aimed.blood(0, 0, 0, { dir: [0, 1] });                     // driven along +z
  const along = aimed.particles.filter((p) => p.vz > 0).length;
  assert.ok(along > aimed.particles.length / 2, `${along} of ${aimed.particles.length} went with the blow`);
  // …and the opposite blow goes the other way: the fan is the direction's, not the pool's.
  const behind = new CombatFx();
  behind.blood(0, 0, 0, { dir: [0, -1] });
  assert.ok(behind.particles.filter((p) => p.vz < 0).length > behind.particles.length / 2);
  // No direction at all is still a spray rather than a line: both axes are in use.
  const ring = new CombatFx();
  ring.blood(0, 0, 0);
  assert.ok(ring.particles.some((p) => Math.abs(p.vx) > 1e-6) && ring.particles.some((p) => Math.abs(p.vz) > 1e-6));
});

// ── the marks on the floor ────────────────────────────────────────────────────

test('the ladder decides how many marks a blow leaves, and the set is capped', () => {
  for (const [damage, maxHealth] of [[1, 20], [8, 20], [20, 20], [40, 20]]) {
    const marks = blow(damage, maxHealth);
    const rate = bloodRate(damage, maxHealth);
    const expected = sprayCount(rate) + (isOverkill(damage, maxHealth) ? burstCount(false) : 0);
    assert.equal(marks.length, Math.min(expected, BLOOD_DECAL_BUDGET),
      `${damage}/${maxHealth}: ${marks.length} marks for a rate of ${rate}`);
  }
  // A heavier blow leaves more: the ladder's own ordering, and the burst branch opens past it.
  assert.ok(blow(20, 20).length > blow(1, 20).length, 'a worse wound bleeds more');
  const overkill = blow(40, 20, { heavy: true });
  assert.ok(overkill.length > blow(1, 20).length && overkill.length <= BLOOD_DECAL_BUDGET,
    `${overkill.length} marks, budget ${BLOOD_DECAL_BUDGET}`);
  // **An unknown blow is the ladder's floor, not nothing**: a trap or a scripted hit still marks
  // where it landed (`scaleRate`'s own `max(1, …)`).
  assert.equal(blow(0, 0).length, sprayCount(bloodRate(0, 0)));
  assert.ok(blow(0, 0).length > 0);
});

test('one seed is one spray, and a creature that bleeds nothing marks nothing', () => {
  const first = blow(9, 20), again = blow(9, 20), other = blow(9, 20, { seed: 99 });
  assert.deepEqual(first, again, 'the same blow and seed answers the same marks');
  assert.notDeepEqual(first.map((d) => d.point), other.map((d) => d.point), 'and another seed another spray');
  assert.deepEqual(blow(9, 20, { bloodless: true }), [], 'Arena\'s skeletons mark nothing (DFU\'s bloodless six)');
  // A position in no world marks nothing either, rather than handing the pool a NaN to swallow.
  assert.deepEqual(bloodDecalsFor({ x: NaN, y: 0, z: 0, damage: 9, maxHealth: 20 }), []);
  assert.deepEqual(bloodDecalsFor({ x: 0, y: 0, z: Infinity, damage: 9, maxHealth: 20 }), []);
});

test('every record is what the pool\'s own place() takes, and no number in it is a NaN', () => {
  const marks = blow(30, 20, { heavy: true, normal: [0, 1, 0] });
  assert.ok(marks.length > 0);
  const fields = ['point', 'normal', 'size', 'tint', 'turn', 'along', 'stretch', 'uv'];
  for (const [i, d] of marks.entries()) {
    assert.deepEqual(Object.keys(d).sort(), [...fields].sort(), `mark ${i} carries exactly the pool's fields`);
    assert.equal(d.point.length, 3);
    assert.equal(d.normal.length, 3);
    assert.equal(d.tint, BLOOD_DECAL_TINT, 'no tint: the mark wears the engine\'s own blood art');
    assert.equal(d.uv, null, 'and the whole texture, as BLOOD1a\'s single frame was');
    for (const n of [...d.point, ...d.normal, d.size, d.turn, d.stretch]) {
      assert.ok(Number.isFinite(n), `mark ${i} has a real number everywhere (${JSON.stringify(d)})`);
    }
    assert.ok(d.size >= 0 && d.stretch >= 1, 'a mark has a size and never a negated streak');
    if (d.along) assert.equal(d.along.length, 3, 'a drop that flew lies along its own travel');
  }
  // Drop zero is the body's own spot — the one mark a hit always leaves, whatever the ladder.
  assert.deepEqual(marks[0].point, [4, 1, -2]);
  // A normal the caller got wrong falls back to the floor rather than poisoning the basis.
  const fallback = bloodDecalsFor({ x: 0, y: 0, z: 0, damage: 5, maxHealth: 10, normal: [NaN, 1, 0] });
  assert.deepEqual(fallback[0].normal, [0, 1, 0]);
});

test('a report says what the set is, so a seam or a HUD never has to count by hand', () => {
  const report = bloodDecalReport(blow(40, 20, { heavy: true }));
  assert.equal(report.budget, BLOOD_DECAL_BUDGET);
  // The set is **cut at the budget** rather than growing past it — a heavy overkill's own
  // appetite is 24 spray marks + 42 burst marks, so this is the case that exercises the cap —
  // and the spray's first mark, the body's own spot, is never the one that falls off.
  assert.equal(report.count, BLOOD_DECAL_BUDGET, 'the worst blow the ladder has stops at the cap');
  assert.equal(report.overBudget, false, 'and the cap is what keeps that true');
  assert.deepEqual(blow(40, 20, { heavy: true })[0].point, [4, 1, -2]);
  assert.ok(report.count > 0 && report.largest > 0 && report.spread > 0, JSON.stringify(report));
  assert.deepEqual(bloodDecalReport([]), { count: 0, budget: BLOOD_DECAL_BUDGET, largest: 0, spread: 0, overBudget: false });
  assert.equal(bloodDecalReport(undefined).count, 0, 'and an absent set is an empty one');
});
