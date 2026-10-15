// The foe reads the guard — pure policy, one function, tested as policy.
import test from 'node:test';
import assert from 'node:assert/strict';

import { foeReadsGuard, BAIT_PATIENCE, STAGGER_SECONDS } from '../../src/game/combatStyle.js';

test('an unguarded player is simply hunted', () => {
  assert.deepEqual(foeReadsGuard({ level: 1 }, { guarding: false }),
    { respect: false, bait: 0, circle: false });
});

test('a heavy creature charges a guard without regard', () => {
  const read = foeReadsGuard({ level: 12 }, { guarding: true });
  assert.equal(read.respect, true);
  assert.equal(read.bait, 0, 'it does not wait');
  assert.equal(read.circle, false, 'it does not drift');
});

test('a light creature baits a fresh guard, and drifts while it does', () => {
  const read = foeReadsGuard({ level: 3 }, { guarding: true, seconds: 0 });
  assert.equal(read.respect, true);
  assert.ok(read.bait > 0 && read.bait < 1, `a short bait: ${read.bait}`);
  assert.equal(read.circle, true);
});

test('a guard held past its patience earns the swing anyway', () => {
  assert.equal(foeReadsGuard({ level: 2 }, { guarding: true, seconds: BAIT_PATIENCE + 0.1 }).bait, 0);
  assert.ok(BAIT_PATIENCE > STAGGER_SECONDS, 'the lure is longer than a stagger — it is a decision, not a knock');
});
