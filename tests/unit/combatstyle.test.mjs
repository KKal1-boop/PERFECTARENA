// THE FIGHT'S OWN RULES, HELD TO THE PROPERTIES THEY CLAIM.
//
// Nothing in `game/combatStyle.js` is Arena's data, so there is no archive to compare it
// against — what can be tested instead is everything it *asserts about itself*:
//
//   * **a roll outruns what it is dodging**, and its i-frames are a slice of the roll rather
//     than all of it (a number a comment claims, checked as arithmetic);
//   * **a parry is a read and not a hold**, and only a *live* defence decides an outcome —
//     a window that missed the blow is a hit, whatever the player was holding;
//   * **a telegraph is the real distance**: the indicator's radius is the profile's own reach
//     over a cell, so a level-1 creature and a level-30 one mark the ground they can actually
//     reach;
//   * **a charge cannot be parried or blocked** and is the only reading that goes on the
//     ground;
//   * **the burst is deterministic** — same blow, same particles — which is what lets a replay
//     of a fight be the same fight.
//
// The last test reads the module's own source: it imports exactly one thing, and it never
// reaches for `Math.random`. That is not decoration — a random number in here would break the
// determinism every other test in this file depends on, and it is the easiest thing in the
// world to add by accident.
//
// Run:  node --test tests/unit/combatstyle.test.mjs     (no data needed)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DASH_CHANCE, DODGE, PARRY, attackPhase, attackProfile, attackShape, dashChance, hitSpark,
  resolveDefence, spendStamina, staminaMax, stepStamina, syncStamina, telegraphReading,
} from '../../src/game/combatStyle.js';

/** A monster as the bestiary rolls one, with nothing but the fields this module reads. */
const creature = (level, extra = {}) => ({ name: `level ${level}`, level, health: 10, maxHealth: 10, damage: [1, 4], ...extra });

// ── the bar ───────────────────────────────────────────────────────────────────

test('the stamina bar follows Endurance and level, and survives nonsense input', () => {
  // Endurance 50 at level 1 is 30: two rolls, or a roll and two parries, and nothing spare.
  assert.equal(staminaMax({ endurance: 50, level: 1 }), 30);
  assert.equal(staminaMax({ endurance: 50, level: 1 }), DODGE.stamina * 2 + PARRY.stamina - 2);
  // An average character can always afford one roll and one parry — the two verbs are never
  // out of reach of the character the game starts you with.
  assert.ok(staminaMax({}) > DODGE.stamina + PARRY.stamina);
  assert.ok(staminaMax({ endurance: 100, level: 20 }) > staminaMax({ endurance: 30, level: 5 }));
  // A character with no attributes at all is still a character.
  assert.equal(staminaMax(), 30);
  assert.ok(staminaMax({ endurance: NaN, level: NaN }) >= 10);
  assert.ok(staminaMax({ endurance: -500, level: -500 }) >= 10, 'never a negative bar');
});

test('the pool is fed by the character, not left on the defaults', () => {
  // The scene's pool begins as `{endurance: 50, level: 1, stamina: undefined}`. Left alone it
  // is a level-1 hero's bar forever; `syncStamina` is what makes the third well the player's.
  const pool = { endurance: 50, level: 1, stamina: undefined, max: undefined, regenIn: 0 };
  syncStamina(pool, { endurance: 80, level: 12 });
  assert.equal(pool.endurance, 80);
  assert.equal(pool.level, 12);
  assert.equal(pool.max, staminaMax({ endurance: 80, level: 12 }));
  assert.equal(pool.stamina, pool.max, 'the first sync starts the bar full');
  // A level-up keeps the share the player was on rather than refilling it.
  pool.stamina = pool.max / 2;
  syncStamina(pool, { endurance: 80, level: 13 });
  assert.equal(pool.max, staminaMax({ endurance: 80, level: 13 }));
  assert.equal(pool.stamina, pool.max / 2);
  assert.ok(pool.max > staminaMax({ endurance: 50, level: 1 }));
  // Nonsense in the sheet cannot empty or overflow the bar.
  syncStamina(pool, { endurance: NaN, level: NaN });
  assert.equal(pool.max, staminaMax({ endurance: 50, level: 1 }));
  assert.ok(pool.stamina >= 0 && pool.stamina <= pool.max);
  assert.equal(syncStamina(null, { endurance: 80, level: 12 }), null);
});

test('a spend is refused atomically at the bottom of the bar', () => {
  const state = { stamina: staminaMax({ endurance: 50, level: 1 }), max: staminaMax({ endurance: 50, level: 1 }) };
  assert.equal(state.stamina, 30);
  assert.equal(spendStamina(state, DODGE.stamina), true);
  assert.equal(state.stamina, 18);
  assert.equal(spendStamina(state, DODGE.stamina), true);
  assert.equal(state.stamina, 6);
  // 6 is not 12: the roll does not happen, and the bar is untouched by the attempt.
  assert.equal(spendStamina(state, DODGE.stamina), false);
  assert.equal(state.stamina, 6);
  assert.equal(spendStamina(state, PARRY.stamina), false);
  assert.equal(state.stamina, 6);
  assert.equal(spendStamina(state, 6), true, 'exactly the last of it is affordable');
  assert.equal(state.stamina, 0);
  assert.equal(spendStamina(state, 1), false);
  assert.equal(spendStamina(state, 0), true, 'a free action never fails');
  assert.equal(spendStamina(null, 5), false, 'no state, no spend');
});

test('stamina regenerates after a pause, not during one', () => {
  const state = { stamina: 30, max: 30 };
  // The pause is what makes a fight about space rather than about mashing: a spent bar stays
  // spent for a beat after the spend, however much time passes in it.
  assert.equal(spendStamina(state, 30), true);
  assert.equal(state.stamina, 0);
  stepStamina(state, 0.5);
  assert.equal(state.stamina, 0, 'still inside the delay');
  stepStamina(state, 0.1);
  assert.equal(state.stamina, 0, 'the frame the delay runs out in does not regenerate either');
  // Six a second: a full bar takes five seconds, longer than any monster's cadence
  // (`attackInterval` is 1.1–2.5 s), so a player cannot roll out of every blow for ever.
  stepStamina(state, 0.5);
  assert.ok(Math.abs(state.stamina - 3) < 1e-9, `half a second of regeneration is three points, got ${state.stamina}`);
  stepStamina(state, 1);
  assert.ok(Math.abs(state.stamina - 9) < 1e-9, `a second more is six points more, got ${state.stamina}`);
  for (let i = 0; i < 100; i++) stepStamina(state, 1);
  assert.equal(state.stamina, 30, 'and it stops at the top');
  // A state that has never been given a bar gets one rather than NaN.
  const fresh = {};
  stepStamina(fresh, 1);
  assert.equal(fresh.max, 30);
  assert.equal(fresh.stamina, 30);
});

// ── the telegraph ─────────────────────────────────────────────────────────────

test('every creature, at any level, telegraphs its blow for a positive time', () => {
  const levels = [-5, 0, 1, 2, 5, 6, 14, 28, 60, NaN, undefined];
  for (const level of levels) {
    const profile = attackProfile(creature(level));
    assert.ok(profile.windup > 0, `level ${level}: windup ${profile.windup}`);
    assert.ok(profile.active > 0, `level ${level}: active ${profile.active}`);
    assert.ok(profile.recover > 0, `level ${level}: recover ${profile.recover}`);
    // The three phases are the creature's own cadence and nothing else: this module must not
    // change how often a monster swings, only what the swing looks like.
    const total = profile.windup + profile.active + profile.recover;
    assert.ok(Math.abs(total - Math.max(0.6, 1.1 + Math.min(1.4, (Number.isFinite(level) ? level : 1) * 0.05))) < 1e-9,
      `level ${level}: phases sum to ${total}`);
    assert.ok(profile.damageScale >= 1, 'an attack never hits softer than the tables say');
    assert.ok(profile.reach > 0 && profile.reach <= 4.4);
    assert.equal(typeof profile.charge, 'boolean');
    assert.equal(profile.unblockable, profile.charge, 'a charge is what cannot be parried');
  }
  assert.ok(attackProfile(undefined).windup > 0, 'a monster with no level at all still telegraphs');
});

test('a big creature reaches further, winds up longer, and the dashing one cannot be parried', () => {
  const rat = attackProfile(creature(1));
  const veteran = attackProfile(creature(6), { shape: 'arc' });
  const lich = attackProfile(creature(30), { shape: 'dash' });
  const circle = attackProfile(creature(30), { shape: 'circle' });
  assert.ok(veteran.reach > rat.reach, 'reach grows with size');
  assert.ok(lich.reach > veteran.reach);
  assert.equal(lich.reach, 4.4, 'capped, so nothing outranges the player by a mile');
  assert.ok(lich.windup > rat.windup, 'and the telegraph takes longer: you can see it coming');
  assert.equal(rat.charge, false, 'a rat does not lunge');
  assert.equal(rat.shape, 'arc', 'below the dash level every blow is the front arc');
  assert.equal(lich.charge, true, 'a dash is the committed lunge');
  assert.equal(lich.unblockable, true, 'so its blow is not parried or blocked');
  assert.equal(circle.charge, false, 'the circle is not a lane');
  assert.equal(circle.shape, 'circle');
  assert.ok(circle.damageScale > veteran.damageScale, 'and it hurts more when it lands');
  assert.ok(lich.damageScale > veteran.damageScale);
  assert.ok(veteran.damageScale > rat.damageScale);
});

test('every creature swings the arc by default, and a low roll buys the lunge more often as the player rises', () => {
  // The owner, 2026-11-04: *"i want everyone to use the normal attack but have a random low
  // chance to dash that increases with the increasing of the player level."* No breed is
  // dash-only: the same rat can swing or lunge depending on the fight's roll.
  assert.equal(attackShape({ id: 'rat', level: 1 }), 'arc', 'with no roll, the arc is the default');
  assert.equal(attackShape({ id: 'wolf', level: 12 }, { playerLevel: 1, dashRoll: 0.9 }), 'arc');
  assert.equal(attackShape({ id: 'wolf', level: 12 }, { playerLevel: 1, dashRoll: 0.01 }), 'dash', 'a low roll is the lunge');
  const ratShapes = new Set([0, 0.1, 0.99].map((dashRoll) =>
    attackShape({ id: 'rat', level: 1 }, { playerLevel: 10, dashRoll })));
  assert.deepEqual([...ratShapes].sort(), ['arc', 'dash'], 'one creature holds both styles');
  // The chance is low, rises with the player's level, and never becomes the ordinary blow.
  assert.equal(dashChance(1), DASH_CHANCE.base);
  assert.ok(dashChance(20) > dashChance(1));
  assert.ok(dashChance(1000) <= DASH_CHANCE.max && DASH_CHANCE.max < 0.5, 'a lunge stays the exception');
  assert.equal(dashChance(NaN), dashChance(1), 'nonsense reads as the start of the game');
  // The boss and the elite keep their own signatures.
  assert.equal(attackShape({ id: 'jagartharn', level: 40 }, { playerLevel: 40, dashRoll: 0 }), 'circle', 'Jagar Tharn keeps the circle');
  assert.equal(attackShape({ id: 'goblin', level: 20, elite: true }, { index: 0 }), 'circle');
  assert.equal(attackShape({ id: 'goblin', level: 20, elite: true }, { index: 1 }), 'dash', 'an elite alternates');
  assert.equal(attackShape({ id: 'goblin', level: 20, charge: true }, { dashRoll: 1 }), 'dash', 'an explicit charge still lunges');
});

test('a phase walk covers the whole attack with no gap and no overlap', () => {
  const profile = attackProfile(creature(10));
  assert.equal(attackPhase(profile, -5).phase, 'windup', 'time before the attack is still windup');
  assert.deepEqual(attackPhase(profile, 0), { phase: 'windup', progress: 0, remaining: profile.windup });
  const midWindup = attackPhase(profile, profile.windup / 2);
  assert.equal(midWindup.phase, 'windup');
  assert.ok(Math.abs(midWindup.progress - 0.5) < 1e-9);
  assert.equal(attackPhase(profile, profile.windup).phase, 'active', 'the boundary belongs to the next phase');
  assert.equal(attackPhase(profile, profile.windup + profile.active).phase, 'recover');
  const done = attackPhase(profile, profile.windup + profile.active + profile.recover);
  assert.equal(done.phase, 'done');
  assert.equal(done.remaining, 0);
  // Progress rises within a phase and the remaining time only ever falls.
  let lastProgress = -1;
  let lastRemaining = Infinity;
  for (let t = 0; t <= profile.windup; t += profile.windup / 8) {
    const read = attackPhase(profile, t);
    assert.ok(read.progress >= lastProgress, `progress is monotone at ${t}`);
    assert.ok(read.remaining <= lastRemaining, `remaining falls at ${t}`);
    lastProgress = read.progress;
    lastRemaining = read.remaining;
  }
});

test('the indicator marks the ground the blow actually lands on', () => {
  const rat = attackProfile(creature(1));
  const windup = telegraphReading(rat, attackPhase(rat, 0));
  assert.equal(windup.ring, 'windup');
  assert.equal(windup.shape, 'arc', 'an ordinary blow is the wedge in front');
  assert.equal(windup.ground, false, 'an ordinary blow is not a hazard on the whole floor');
  assert.ok(Math.abs(windup.radiusInCells - rat.reach / 2.5) < 1e-9, 'the radius is the reach, in cells');
  const strike = telegraphReading(rat, attackPhase(rat, rat.windup + rat.active / 2));
  assert.equal(strike.ring, 'active');
  assert.notEqual(strike.colour, windup.colour, 'a blow that is landing reads differently from one that is coming');
  assert.deepEqual(telegraphReading(rat, { phase: 'recover' }), { ring: 'none', colour: '#000000', radiusInCells: 0, ground: false, shape: 'none' });
  assert.deepEqual(telegraphReading(rat, { phase: 'done' }), { ring: 'none', colour: '#000000', radiusInCells: 0, ground: false, shape: 'none' });
  // A dash is the one ordinary attack whose answer is to be somewhere else, so it is drawn on
  // the ground — and the reading says so for the whole of it, wind-up included.
  const lich = attackProfile(creature(30), { shape: 'dash' });
  for (const elapsed of [0, lich.windup / 2, lich.windup + 0.01]) {
    const reading = telegraphReading(lich, attackPhase(lich, elapsed));
    assert.notEqual(reading.ring, 'none');
    assert.equal(reading.ground, true, `a charge marks the ground at ${elapsed}s`);
  }
  assert.ok(telegraphReading(lich, attackPhase(lich, 0)).radiusInCells > windup.radiusInCells);
});

// ── the answer ────────────────────────────────────────────────────────────────

test('only a live defence decides the outcome, whatever the player was holding', () => {
  const active = { phase: 'active' };
  assert.deepEqual(resolveDefence({ ...active, intent: 'none', defence: 'none' }), { outcome: 'hit', damageScale: 1, riposte: 0 });
  assert.deepEqual(resolveDefence({ ...active, intent: 'dodge', defence: 'dodge' }), { outcome: 'dodged', damageScale: 0, riposte: 0 });
  assert.deepEqual(resolveDefence({ ...active, intent: 'parry', defence: 'parry' }), { outcome: 'parried', damageScale: 0, riposte: PARRY.riposteScale });
  const blocked = resolveDefence({ ...active, intent: 'block', defence: 'block' });
  assert.equal(blocked.outcome, 'blocked');
  assert.ok(blocked.damageScale > 0 && blocked.damageScale < 1, `a shield stops most of it, not all: ${blocked.damageScale}`);
  assert.equal(blocked.riposte, 0, 'only a parry turns the blow back');
  // The *intent* is not what counts: a player who meant to parry but only had a shield up is
  // in the same position as one who meant to block.
  assert.equal(resolveDefence({ ...active, intent: 'parry', defence: 'block' }).outcome, 'blocked');
  // And a nonsense defence is no defence.
  assert.equal(resolveDefence({ ...active, defence: 'cartwheel' }).outcome, 'hit');
  assert.equal(resolveDefence().outcome, 'hit', 'no arguments at all is an unopposed blow');
});

test('a defence that missed its moment is a hit, however well it was meant', () => {
  // The blow is still coming (windup) or has already landed (recover): either way the window
  // and the blow never met, which is what mashing produces and what reading avoids.
  for (const phase of ['windup', 'recover', 'done']) {
    for (const defence of ['dodge', 'parry', 'block']) {
      const out = resolveDefence({ phase, intent: defence, defence });
      assert.equal(out.outcome, 'hit', `${defence} at ${phase}`);
      assert.equal(out.damageScale, 1);
    }
  }
});

test('a dodge covers only its i-frame window, and that window outruns the blow', () => {
  assert.ok(DODGE.iframeStart > 0 && DODGE.iframeEnd < DODGE.seconds, 'the window is inside the roll');
  assert.ok(DODGE.iframeEnd > DODGE.iframeStart);
  const window = DODGE.iframeEnd - DODGE.iframeStart;
  assert.ok(window < DODGE.seconds / 2, `i-frames are a slice of the roll, not the roll: ${window}s of ${DODGE.seconds}s`);
  // What a caller hands `resolveDefence` is exactly this test: live inside the window, nothing
  // outside it. Both halves of a roll that was committed at the wrong moment are hits.
  const live = (elapsed) => (elapsed >= DODGE.iframeStart && elapsed <= DODGE.iframeEnd ? 'dodge' : 'none');
  assert.equal(live(0), 'none', 'the step into the roll is not invulnerable');
  assert.equal(live(DODGE.iframeStart), 'dodge');
  assert.equal(live((DODGE.iframeStart + DODGE.iframeEnd) / 2), 'dodge');
  assert.equal(live(DODGE.iframeEnd + 0.01), 'none', 'nor is standing up out of it');
  assert.equal(resolveDefence({ phase: 'active', intent: 'dodge', defence: live(DODGE.seconds) }).outcome, 'hit');
  assert.equal(resolveDefence({ phase: 'active', intent: 'dodge', defence: live(DODGE.iframeStart + window / 2) }).outcome, 'dodged');
  // A roll that did not outrun the creature closing on you would be decoration: 7.6 m/s against
  // the scene's own `MONSTER_SPEED` of 5.5.
  const speed = DODGE.distance / DODGE.seconds;
  assert.ok(speed > 5.5, `a roll covers ${speed.toFixed(2)} m/s`);
  // And a parry is a read, not a hold — the same rule, on a shorter action.
  assert.ok(PARRY.activeFrom > 0 && PARRY.activeTo < PARRY.seconds);
  assert.ok(PARRY.activeTo - PARRY.activeFrom < PARRY.seconds / 2, 'the live part of a parry is less than half of it');
  assert.ok(PARRY.stamina < DODGE.stamina, 'parrying repeatedly has to be affordable');
});

test('a charge cannot be parried or blocked, and can still be dodged', () => {
  const charge = { phase: 'active', unblockable: true };
  assert.deepEqual(resolveDefence({ ...charge, intent: 'parry', defence: 'parry' }), { outcome: 'hit', damageScale: 1, riposte: 0 });
  assert.deepEqual(resolveDefence({ ...charge, intent: 'block', defence: 'block' }), { outcome: 'hit', damageScale: 1, riposte: 0 });
  assert.equal(resolveDefence({ ...charge, intent: 'dodge', defence: 'dodge' }).outcome, 'dodged', 'being elsewhere is the whole answer');
  // The dash's own profile is what sets the flag, so the two cannot disagree.
  const lich = attackProfile(creature(30), { shape: 'dash' });
  assert.equal(lich.unblockable, true);
  assert.equal(resolveDefence({ phase: 'active', intent: 'parry', defence: 'parry', unblockable: lich.unblockable }).outcome, 'hit');
});

// ── what a blow leaves ────────────────────────────────────────────────────────

test('the same blow bursts the same way, every time', () => {
  const one = hitSpark({ outcome: 'hit', damage: 6 });
  const two = hitSpark({ outcome: 'hit', damage: 6 });
  assert.deepEqual(one, two, 'a replay of a fight is the same fight');
  assert.equal(one.count, one.particles.length);
  assert.ok(one.particles.length > 0);
  for (const particle of one.particles) {
    for (const key of ['vx', 'vy', 'vz', 'life', 'size']) {
      assert.ok(Number.isFinite(particle[key]), `${key} is a number`);
    }
    assert.ok(/^#[0-9a-f]{6}$/.test(particle.colour), particle.colour);
    assert.ok(particle.life > 0 && particle.size > 0);
  }
  let sum = 0;
  for (const particle of one.particles) sum += Math.hypot(particle.vx, particle.vz);
  assert.ok(sum > 0, 'the spray has directions, not all zeros');
});

test('a heavier blow throws more, and a dodged one throws nothing', () => {
  const light = hitSpark({ outcome: 'hit', damage: 2 });
  const heavy = hitSpark({ outcome: 'hit', damage: 2, heavy: true });
  const brutal = hitSpark({ outcome: 'hit', damage: 40 });
  assert.ok(heavy.count > light.count);
  assert.ok(brutal.count > light.count, 'damage adds to the burst');
  const huge = hitSpark({ outcome: 'hit', damage: 10000, heavy: true });
  assert.equal(huge.count, 22, 'and it is capped');
  assert.equal(huge.count, hitSpark({ outcome: 'hit', damage: 40, heavy: true }).count, 'past the cap, more damage throws no more');
  for (const spark of [light, heavy, brutal, huge]) assert.ok(spark.count <= 24);
  const dodged = hitSpark({ outcome: 'dodged', damage: 12 });
  assert.deepEqual(dodged.particles, []);
  assert.equal(dodged.count, 0);
  assert.equal(dodged.screenShake, 0, 'a blow you avoided does not move the camera');
  // Every outcome reads differently, and the ring of steel is felt harder than a shield.
  const outcomes = ['hit', 'parried', 'blocked'].map((outcome) => hitSpark({ outcome, damage: 5 }));
  assert.equal(new Set(outcomes.map((s) => s.particles[0].colour)).size, 3, 'three outcomes, three colours');
  assert.ok(hitSpark({ outcome: 'parried' }).screenShake > hitSpark({ outcome: 'blocked' }).screenShake);
  assert.ok(hitSpark({ outcome: 'hit', heavy: true }).screenShake > hitSpark({ outcome: 'hit' }).screenShake);
});

// ── the module's own manners ──────────────────────────────────────────────────

test('the fight core is pure: one import, and no dice', () => {
  const source = readFileSync(new URL('../../src/game/combatStyle.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import .*$/gm)].map((m) => m[0]);
  assert.deepEqual(imports, ["import { attackInterval } from './combat.js';"],
    `the only import is Arena's own cadence; found ${imports.join(' | ')}`);
  assert.ok(!/Math\.random\s*\(/.test(source), 'no unseeded randomness anywhere in the fight core');
  assert.ok(!/\bDate\b/.test(source.replace(/\/\/.*$/gm, '')), 'and no clock: a fight is a function of its inputs');
  assert.ok(!/document|window\./.test(source), 'and no DOM');
});
