// THE HUD'S TWO SWITCHES — the compass, and the interface put away for a photograph.
//
//   node --test tests/unit/hudsettings.test.mjs
//
// `game/hudSettings.js` is a `localStorage` pref pair and a class flip on `<body>`, and both
// halves are what a player sees: the compass must come back after a reload, and a page loaded
// with the interface hidden must open hidden. The browser suite (`tests/suites/phone.mjs`) holds
// the pixels; this file holds the store, including the browser that refuses it.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPASS_KEY, GUI_HIDDEN_KEY, applyHudSettings, compassEnabled, guiHidden,
  setCompassEnabled, setGuiHidden,
} from '../../src/game/hudSettings.js';

/** A `localStorage` that behaves, and remembers what was written. */
function fakeStore() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

/** A `<body>` with a class list, written the way the stylesheet reads it. */
function fakeDoc() {
  const classes = new Set();
  return {
    classes,
    body: {
      classList: {
        toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
        contains: (name) => classes.has(name),
      },
    },
  };
}

test('both switches have their stated defaults: the compass on, the interface shown', () => {
  globalThis.localStorage = fakeStore();
  assert.equal(compassEnabled(), true);
  assert.equal(guiHidden(), false);
  delete globalThis.localStorage;
});

test('the compass remembers being turned off, under its own key', () => {
  const store = fakeStore();
  globalThis.localStorage = store;
  assert.equal(setCompassEnabled(false), false);
  assert.equal(store.map.get(COMPASS_KEY), '0');
  assert.equal(compassEnabled(), false);
  assert.equal(setCompassEnabled(true), true);
  assert.equal(compassEnabled(), true);
  delete globalThis.localStorage;
});

test('the interface remembers being hidden, under its own key', () => {
  const store = fakeStore();
  globalThis.localStorage = store;
  assert.equal(setGuiHidden(true), true);
  assert.equal(store.map.get(GUI_HIDDEN_KEY), '1');
  assert.equal(guiHidden(), true);
  assert.equal(setGuiHidden(false), false);
  assert.equal(guiHidden(), false);
  delete globalThis.localStorage;
});

test('a browser that refuses storage still gets a working switch for the page', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
  };
  assert.equal(compassEnabled(), true, 'the default, not a crash');
  assert.equal(setCompassEnabled(false), false, 'the caller is answered what it asked for');
  assert.equal(setGuiHidden(true), true);
  assert.equal(guiHidden(), false, 'nothing was remembered, so the default stands');
  delete globalThis.localStorage;
});

test('applying the settings writes the two body classes the stylesheet reads', () => {
  globalThis.localStorage = fakeStore();
  const doc = fakeDoc();
  const shown = applyHudSettings({ doc });
  assert.deepEqual(shown, { compass: true, hidden: false });
  assert.equal(doc.classes.has('no-compass'), false);
  assert.equal(doc.classes.has('gui-hidden'), false);

  const hidden = applyHudSettings({ compass: false, hidden: true, doc });
  assert.deepEqual(hidden, { compass: false, hidden: true });
  assert.equal(doc.classes.has('no-compass'), true);
  assert.equal(doc.classes.has('gui-hidden'), true);

  applyHudSettings({ compass: true, hidden: false, doc });
  assert.equal(doc.classes.has('no-compass'), false);
  assert.equal(doc.classes.has('gui-hidden'), false);
  delete globalThis.localStorage;
});

test('applying with nothing said reads the store — which is what a reload wants', () => {
  const store = fakeStore();
  store.map.set(COMPASS_KEY, '0');
  store.map.set(GUI_HIDDEN_KEY, '1');
  globalThis.localStorage = store;
  const doc = fakeDoc();
  const state = applyHudSettings({ doc });
  assert.deepEqual(state, { compass: false, hidden: true });
  assert.equal(doc.classes.has('no-compass'), true);
  assert.equal(doc.classes.has('gui-hidden'), true);
  delete globalThis.localStorage;
});
