// THE PHONE IN HAND (2026-10-22): the stick's law.
//
// The owner: *"COMPLETE ANDROID/IOS SUPPORT IF OPENED ON A PHONE WITHOUT ALTERING THE CODE OF
// THE GAME"*. `engine/ui/touchControls.js` is a layer, and the half worth testing without a
// browser is the arithmetic: what a push means, where the dead zone ends, and which keys a
// throw holds. The DOM half is exercised by the page itself.
//
// Run:  node --test tests/unit/touchcontrols.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STICK_DEAD_ZONE, STICK_RADIUS, STICK_RUN, TOUCH_BUTTONS, TOUCH_SCREEN_BUTTONS,
  pressKey, stickAxis,
} from '../../src/engine/ui/touchControls.js';

test('a still stick holds nothing', () => {
  const rest = stickAxis(0, 0);
  assert.deepEqual(rest, { x: 0, y: 0, run: false, forward: false, back: false, left: false, right: false });
  // Inside the dead zone there is no walk at all, in any direction.
  for (const [dx, dy] of [[2, 2], [-3, 1], [0, 8], [6, 0]]) {
    assert.equal(stickAxis(dx, dy).forward || stickAxis(dx, dy).right || stickAxis(dx, dy).left, false);
  }
});

test('pushing up walks forward, down walks back, and sideways strafes', () => {
  assert.equal(stickAxis(0, -STICK_RADIUS).forward, true);
  assert.equal(stickAxis(0, STICK_RADIUS).back, true);
  assert.equal(stickAxis(-STICK_RADIUS, 0).left, true);
  assert.equal(stickAxis(STICK_RADIUS, 0).right, true);
});

test('a full push runs and a half push does not', () => {
  assert.equal(stickAxis(0, -STICK_RADIUS).run, true);
  assert.equal(stickAxis(0, -STICK_RADIUS * STICK_RUN * 0.9).run, false);
  // The clamp: a finger past the rim is still a full throw, not a bigger one.
  const past = stickAxis(0, -STICK_RADIUS * 4);
  assert.ok(Math.abs(past.y) <= 1.0001);
});

test('the throw is rescaled from the dead zone, so the first motion is the smallest walk', () => {
  const justOut = stickAxis(0, -(STICK_RADIUS * (STICK_DEAD_ZONE + 0.02)));
  assert.ok(justOut.y < 0.1, `just outside the dead zone is a crawl, measured ${justOut.y}`);
  const half = stickAxis(0, -STICK_RADIUS * 0.6);
  assert.ok(Math.abs(half.y) > Math.abs(justOut.y) && Math.abs(half.y) < 1);
});

test('a diagonal is a diagonal', () => {
  const diagonal = stickAxis(STICK_RADIUS * 0.7, -STICK_RADIUS * 0.7);
  assert.equal(diagonal.forward, true);
  assert.equal(diagonal.right, true);
  assert.equal(diagonal.left, false);
  assert.equal(diagonal.back, false);
});

test('every button presses a real DOM key code, and the screens row has the panels', () => {
  const codes = TOUCH_BUTTONS.map((button) => button.key);
  for (const code of ['KeyF', 'KeyE', 'KeyT', 'KeyZ', 'KeyB', 'Space']) assert.ok(codes.includes(code), code);
  const screens = TOUCH_SCREEN_BUTTONS.map((button) => button.key);
  for (const code of ['KeyI', 'KeyC', 'KeyM', 'Tab', 'Escape']) assert.ok(screens.includes(code), code);
  for (const button of [...TOUCH_BUTTONS, ...TOUCH_SCREEN_BUTTONS]) {
    assert.ok(button.label && button.title, `${button.id} is labelled`);
  }
});

test('a press is a real keyboard event on the window', () => {
  const seen = [];
  const listener = (event) => seen.push([event.type, event.code, event.key]);
  globalThis.window = { dispatchEvent: (event) => { listener(event); return true; } };
  class FakeKeyEvent {
    constructor(type, init) { this.type = type; this.code = init.code; this.key = init.key; }
  }
  const realEvent = globalThis.KeyboardEvent;
  globalThis.KeyboardEvent = FakeKeyEvent;
  try {
    pressKey('keydown', 'KeyF');
    pressKey('keyup', 'KeyF');
    pressKey('keydown', 'Digit7');
    assert.deepEqual(seen[0], ['keydown', 'KeyF', 'f']);
    assert.deepEqual(seen[1], ['keyup', 'KeyF', 'f']);
    assert.deepEqual(seen[2], ['keydown', 'Digit7', '7']);
  } finally {
    globalThis.KeyboardEvent = realEvent;
    delete globalThis.window;
  }
});
