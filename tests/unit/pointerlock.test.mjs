// A PHONE HAS NO MOUSE TO LOCK (2026-10-22).
//
// The owner, playing on Android Chrome: *"when i click it starts saying 'change app to see the
// cursor again' and i cant look around"* — the browser's own pointer-lock notice, on a screen whose
// only pointer is a finger. The scene asks for the lock on every keydown and every tap (its ladder
// ends on `requestLook`), so the notice returned on every press. The guard is one question —
// `(any-pointer: fine)`, is there a mouse at all — asked in the one place every request goes
// through, so `?touch=on` on a laptop (fine AND coarse) keeps its mouse look.
//
// Run:  node --test tests/unit/pointerlock.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COARSE_POINTER_QUERY, FINE_POINTER_QUERY, mousePointerAvailable, requestLook,
} from '../../src/engine/player/pointerLock.js';

/** A window whose media queries answer exactly what a test says, and say what was asked. */
function windowWith(matches) {
  const asked = [];
  return {
    asked,
    matchMedia(query) { asked.push(query); return { matches: matches(query) }; },
  };
}

/** A phone in hand: a finger is its only pointer. */
const phone = () => windowWith((q) => q === COARSE_POINTER_QUERY);
/** A laptop: a trackpad answers `fine` (its touchscreen, if any, answers `coarse` too). */
const desk = () => windowWith((q) => q === FINE_POINTER_QUERY || q === COARSE_POINTER_QUERY);

test('a phone declares no mouse, a desk does, and an engine that cannot answer keeps the mouse', () => {
  const laptop = desk();
  assert.equal(mousePointerAvailable(phone()), false, 'a finger is not a pointer to lock');
  assert.equal(mousePointerAvailable(laptop), true, '`?touch=on` on a desk keeps its mouse look');
  assert.equal(mousePointerAvailable(windowWith(() => false)), true,
    'neither pointer class known (an old engine): not a phone’s');
  assert.equal(mousePointerAvailable({}), true, 'no media queries at all');
  assert.equal(mousePointerAvailable({ matchMedia() { throw new Error('refused'); } }), true);
  // The question it asks is the pointer class, never the touch sniff: one read, `fine` first.
  assert.deepEqual(laptop.asked, [FINE_POINTER_QUERY]);
});

test('the lock is asked for on a desk and never on a phone', () => {
  const asked = [];
  const canvas = {
    requestPointerLock(opts) { asked.push(opts ?? null); return Promise.resolve(); },
  };
  const restore = globalThis.matchMedia;
  try {
    globalThis.matchMedia = (q) => ({ matches: q === COARSE_POINTER_QUERY });
    requestLook(canvas);
    assert.equal(asked.length, 0,
      'a phone asked for a lock: that request IS Chrome’s “change app to see the cursor again”');

    globalThis.matchMedia = (q) => ({ matches: q === FINE_POINTER_QUERY || q === COARSE_POINTER_QUERY });
    requestLook(canvas);
    assert.equal(asked.length, 1, 'a desk asks once');
    assert.deepEqual(asked[0], { unadjustedMovement: true }, 'and asks for the raw device counts (MAC1)');
  } finally {
    if (restore) globalThis.matchMedia = restore;
    else delete globalThis.matchMedia;
  }
});
