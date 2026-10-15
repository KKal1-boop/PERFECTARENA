// Poise — the weight a landed wound carries — in a world of pure timers.
//
// The scene does the staggering (it drops the committed attack); what the *module* owes is
// the meter's own arithmetic: it drains by a wound's weight, a break refills it exactly
// once, and nothing here invents a clock the scene does not already run.
import test from 'node:test';
import assert from 'node:assert/strict';

import { STAGGER_SECONDS, poiseMax, poiseCost, applyPoise } from '../../src/game/combatStyle.js';

test('poiseMax grows gently with level: a rat staggers, a tyrant is stubborn', () => {
  assert.equal(poiseMax(1), 20);
  assert.equal(poiseMax(14), 46);
  assert.ok(poiseMax(14) < poiseMax(30) * 2, 'level parity never makes a foe immune');
  assert.equal(poiseMax(0), 18, 'levelless is level-one footing');
});

test('poiseCost is heavy in the wound and heavier in the riposte', () => {
  assert.equal(poiseCost({ damage: 10 }), 6);
  assert.equal(poiseCost({ damage: 3 }), 2);
  assert.ok(poiseCost({ damage: 10, riposte: true }) === 11, 'a turned blow unsettles');
  assert.equal(poiseCost({ damage: 0 }), 1, 'a graze still touches footing');
});

test('the meter drains, breaks, and refills exactly once on the break', () => {
  const state = { max: 20 };
  assert.ok(!applyPoise(state, 5).staggered);
  assert.equal(state.poise, 15);
  assert.ok(!applyPoise(state, 10).staggered);
  assert.equal(state.poise, 5);
  assert.ok(applyPoise(state, 6).staggered, 'the meter empties and the footing goes');
  assert.equal(state.poise, 20, 'poise never stays broken');
  assert.ok(!applyPoise(state, 6).staggered);
  assert.equal(state.poise, 14);
});

test('a state created bare gets its own max, and the stagger is a real opening', () => {
  const bare = {};
  const end = applyPoise(bare, 200);
  assert.ok(end.staggered);
  assert.equal(bare.max, poiseMax(1));
  assert.ok(STAGGER_SECONDS < 1.1, 'shorter than the smallest attackInterval');
  assert.ok(STAGGER_SECONDS > 0.55, 'longer than the player swing cooldown');
});

test('a zero bite changes nothing', () => {
  const state = { poise: 9, max: 20 };
  assert.ok(!applyPoise(state, 0).staggered);
  assert.equal(state.poise, 9);
});
