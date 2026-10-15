// The held heavy — `combatStyle.js`'s HEAVY and `chargeScale` — in a world of pure timers.
//
// The scenario a player reports ("I held the button and it just… swung again") lives earlier
// than any scene: it lives in whether `held` seconds decide *heavy at all*, *how heavy*, and
// never above full. The scene's wiring is proven on the browser (the click is a hold there);
// this is what the hold's own arithmetic knows.
import test from 'node:test';
import assert from 'node:assert/strict';

import { HEAVY, chargeScale, PARRY, DODGE } from '../../src/game/combatStyle.js';

test('a tap is not a heavy', () => {
  for (const held of [0, 0.05, 0.15, HEAVY.armSeconds - 0.01]) {
    const charge = chargeScale(held);
    assert.equal(charge.heavy, false, `held ${held} is a light blow`);
    assert.equal(charge.scale, 1, `held ${held} pays no multiplier`);
    assert.ok(charge.progress >= 0 && charge.progress <= 1, 'progress stays a fraction');
  }
});

test('a hold past the arm is a heavy, and its weight climbs with the hold', () => {
  const first = chargeScale(HEAVY.armSeconds);
  assert.equal(first.heavy, true);
  assert.ok(first.scale >= 1.3, 'the first committed heavy is already heavier than a light blow');
  const full = chargeScale(HEAVY.fullSeconds);
  assert.equal(full.heavy, true);
  assert.equal(full.scale, HEAVY.scale, 'the full hold is the full weight');
  assert.equal(full.progress, 1);
  const halfway = chargeScale(HEAVY.armSeconds + (HEAVY.fullSeconds - HEAVY.armSeconds) / 2);
  assert.ok(halfway.scale > first.scale && halfway.scale < full.scale, 'the climb is a climb');
});

test('holding past the full hold is capped, not rewarded', () => {
  for (const held of [HEAVY.fullSeconds + 0.4, HEAVY.fullSeconds * 3, 30]) {
    assert.equal(chargeScale(held).scale, HEAVY.scale, `held ${held} is still the full heavy`);
  }
});

test('the heavy costs more than a roll and less than the whole bar', () => {
  assert.ok(HEAVY.stamina > DODGE.stamina, 'a heavy is dearer than a dodge');
  assert.ok(HEAVY.stamina < PARRY.stamina + 60 /* an arbitrary bar the smallest build has */,
    'not every character can chain heavies, but some can chain one');
  assert.ok(HEAVY.cooldown > DODGE.seconds, 'the heavy commits past a dodge out of it');
});
