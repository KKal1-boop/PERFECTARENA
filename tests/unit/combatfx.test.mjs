import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attackFootprint, fitAttackToGround, insideAttack, CombatFx, FX_MAX_PARTICLES, FX_MAX_VERTICES,
  SPELL_ART, SPELL_ART_FPS, spellExplosionArt, spellFamily, spellProjectileArt, spellSplashArt,
} from '../../src/game/combatFx.js';
import { fireBolt } from '../../src/game/ranged.js';
const attack = (shape = 'arc') => ({ origin: { x: 10, y: 2.5, z: 10 }, yaw: 0,
  profile: { reach: 5, shape, charge: shape === 'dash', windup: 0.6, active: 0.2 }, elapsed: 0.3 });

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

test('dash damage uses the lane actually drawn, not a homing circle', () => {
  const a = attack('dash');
  assert.equal(insideAttack(a, 10, 14), true);
  assert.equal(insideAttack(a, 12, 14), false);
  assert.equal(insideAttack(a, 10, 8), false);
  assert.equal(insideAttack(a, 10, 16), false);
  assert.equal(attackFootprint(a).width, 1.6);
});

test('an ordinary blow is the arc in front; only the boss and an elite own the circle', () => {
  const arc = attack('arc');
  assert.equal(insideAttack(arc, 10, 14), true, 'straight ahead is inside the wedge');
  assert.equal(insideAttack(arc, 10, 8), false, 'behind the creature is outside it');
  assert.equal(insideAttack(arc, 14, 10), false, 'side-on is outside it');
  assert.equal(attackFootprint(arc).width, 0, 'an arc is not a lane');
  const circle = attack('circle');
  assert.equal(insideAttack(circle, 10, 8), true);
  assert.equal(insideAttack(circle, 13, 13), true);
  assert.equal(insideAttack(circle, 10, 20), false);
  assert.equal(attackFootprint(circle).shape, 'circle');
});

test('rings exactly describe melee reach and disappear on recovery', () => {
  const fx = new CombatFx(), a = attack();
  const actor = { monster: { health: 1 }, attack: a };
  assert.equal(insideAttack(a, 13, 14), true);
  assert.equal(insideAttack(a, 13.01, 14), false);
  a.elapsed = 1;
  assert.equal(fx.geometry([actor], [1, 0, 0]).length, 0);
});

// The owner, 2026-10-22: *"SPELL PARTICLE SPRITES BOTH USED BY THE PLAYER AND ENEMIES ARE NOT
// WORKING AS INTENDED"*, and then *"still dont work exactly as intended"*. The executable's own
// table settles what the art is: 27 names — `exp_ab…exp_md` (the bursts), `fx_ab…fx_md` (the
// projectiles), then `bloodexp`, `sparkle`, `dust` (the physical hits) — and, beside the game's
// own casting line, `fire.cfa`, `ice.cfa`, `acid.cfa`, `shock.cfa`, `magic.cfa`, which are the
// sheets it paints across the 320 × 200 view. Six families, three pictures each.
test('the install\'s effect table names a projectile, a burst and a screen sheet per element', () => {
  assert.equal(spellFamily('fire'), 'F');
  assert.equal(spellFamily('FIRE'), 'F', 'the element is read case-insensitively');
  assert.equal(spellFamily('cold'), 'I');
  assert.equal(spellFamily('poison'), 'A');
  assert.equal(spellFamily('shock'), 'E');
  assert.equal(spellFamily('magic'), 'M');
  assert.equal(spellFamily('disease'), 'G');
  assert.equal(spellFamily('something nobody named'), 'M', 'an unknown cast is drawn as magic');
  assert.equal(spellFamily('physical'), null, 'a blow is not a spell');
  // The five damage elements the spell file names, and the family each flies as.
  for (const [element, family] of [['fire', 'F'], ['cold', 'I'], ['poison', 'A'], ['shock', 'E'], ['magic', 'M']]) {
    assert.equal(spellProjectileArt(element), `FX_${family}B.CFA`);
    assert.equal(spellExplosionArt(element), `EXP_${family}B.CFA`);
  }
  for (const cold of ['cold', 'frost', 'ice']) assert.equal(spellProjectileArt(cold), 'FX_IB.CFA');
  assert.equal(spellProjectileArt('heal'), 'FX_MB.CFA', 'a self spell is magic');
  // The screen sheets, in the spell file's own element order.
  assert.equal(spellSplashArt('fire'), 'FIRE.CFA');
  assert.equal(spellSplashArt('cold'), 'ICE.CFA');
  assert.equal(spellSplashArt('poison'), 'ACID.CFA');
  assert.equal(spellSplashArt('shock'), 'SHOCK.CFA');
  assert.equal(spellSplashArt('magic'), 'MAGIC.CFA');
  assert.equal(spellSplashArt('disease'), 'SMOKE.CFA');
  assert.equal(spellProjectileArt('physical'), null);
  assert.equal(spellSplashArt('physical'), null);
  // What the loader is told to read: all three sets, once each, and no `_D` take — the install
  // ships two of every family and nothing readable says when the original chose the smaller one.
  assert.equal(SPELL_ART.length, 18);
  assert.equal(new Set(SPELL_ART).size, SPELL_ART.length);
  for (const sheet of ['FX_FB.CFA', 'EXP_AB.CFA', 'FIRE.CFA', 'SMOKE.CFA']) assert.ok(SPELL_ART.includes(sheet));
  assert.ok(SPELL_ART.every((sheet) => /\.CFA$/.test(sheet)));
  assert.ok(SPELL_ART.every((sheet) => !/_D\.CFA$/.test(sheet)));
  assert.equal(SPELL_ART_FPS, 12, 'the original\'s effect animation rate');
});

test('a cast flies as the install\'s projectile and bursts where it lands', () => {
  const fx = new CombatFx();
  fx.setArtFrames(new Map([['FX_FB.CFA', 5], ['EXP_FB.CFA', 12]]));
  // A self-cast has no flight: its burst stands at the hands.
  assert.equal(fx.magicBurst(1, 1, 2, { element: 'fire' }), 1);
  assert.equal(fx.flights.length, 0);
  assert.equal(fx.explosions.length, 1);
  assert.equal(fx.explosions[0].sheet, 'EXP_FB.CFA');
  assert.equal(fx.explosions[0].life, 1, 'twelve frames at twelve a second');
  assert.equal(fx.explosions[0].age, 0);
  // A cast at something flies: the element's `FX_` from the hands, its `EXP_` at the target.
  const cast = new CombatFx();
  cast.setArtFrames(new Map([['FX_IB.CFA', 5], ['EXP_IB.CFA', 9]]));
  assert.equal(cast.magicBurst(10, 1, 0, { element: 'cold', from: [0, 1, 0] }), 1);
  assert.equal(cast.flights.length, 1);
  assert.equal(cast.flights[0].sheet, 'FX_IB.CFA');
  assert.equal(cast.flights[0].explosion, 'EXP_IB.CFA');
  assert.ok(cast.flights[0].life >= 0.08 && cast.flights[0].life <= 0.4, `${cast.flights[0].life} s`);
  assert.equal(cast.explosions.length, 0, 'nothing bursts until the spell arrives');
  // It travels in a straight line and bursts on the point it was aimed at.
  cast.step(cast.flights[0].life / 2);
  assert.ok(cast.flights[0].x > 4 && cast.flights[0].x < 10, `at ${cast.flights[0].x} m`);
  cast.step(cast.flights[0].life / 2 + 0.01);
  assert.equal(cast.flights.length, 0);
  assert.equal(cast.explosions.length, 1);
  assert.deepEqual([cast.explosions[0].x, cast.explosions[0].z], [10, 0]);
  assert.equal(cast.explosions[0].sheet, 'EXP_IB.CFA');
  assert.ok(Math.abs(cast.explosions[0].life - 9 / 12) < 1e-9, 'its own nine frames, not a guess');
  cast.step(2);
  assert.equal(cast.explosions.length, 0);
  // A point that is not a point throws nothing, and a burst is not stacked on itself.
  assert.equal(new CombatFx().magicBurst(NaN, 0, 0), 0);
  const one = new CombatFx();
  for (let i = 0; i < 5; i++) one.magicBurst(1, 1, 2, { element: 'fire' });
  assert.equal(one.explosions.length, 1, 'one burst per square metre');
  assert.equal(one.magicBursts, 5, 'and every cast counted');
  const many = new CombatFx();
  for (let i = 0; i < 20; i++) many.magicBurst(i * 3, 1, 0, { element: 'shock' });
  assert.equal(many.explosions.length, 8, 'the pool has a hard ceiling');
  assert.equal(many.overlays, undefined, 'nothing is painted over the view by a burst');
});

test('a cast puts the element\'s own sheet across the view, one at a time', () => {
  const fx = new CombatFx();
  fx.setArtFrames(new Map([['FIRE.CFA', 8], ['ICE.CFA', 9]]));
  assert.equal(fx.spellSplash('fire'), true);
  assert.equal(fx.splashes.length, 1);
  assert.equal(fx.splashes[0].sheet, 'FIRE.CFA');
  assert.equal(fx.splashes[0].life, 8 / 12);
  assert.equal(fx.spellSplash('cold'), true);
  assert.equal(fx.splashes.length, 1, 'a second cast replaces the first, never stacks');
  assert.equal(fx.splashes[0].sheet, 'ICE.CFA');
  assert.equal(fx.splashesShown, 2);
  fx.step(fx.splashes[0].life + 0.01);
  assert.equal(fx.splashes.length, 0);
  assert.equal(new CombatFx().spellSplash('physical'), false, 'a blow paints nothing');
});

test('a bolt is its element\'s own projectile sheet', () => {
  const fire = fireBolt({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }, { damage: 10, id: 'firedaemon', element: 'fire' });
  assert.equal(fire.element, 'fire');
  assert.equal(fire.art, 'FX_FB.CFA');
  assert.equal(fire.age, 0);
  assert.equal(fireBolt({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { element: 'cold' }).art, 'FX_IB.CFA');
  // The bolt carries its sprite's first frame the instant it is fired and loops from there; the
  // scene reads `age × SPELL_ART_FPS` (`liveBatches`).
  assert.equal(fireBolt({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { element: 'physical' }).art, null);
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
