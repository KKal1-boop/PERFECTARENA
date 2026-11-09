// FIRST-RUN LEVELS — FULL, NOT MUTED (2026-11-04).
//
// The owner: *"when you start the game for the first time the sound and music is to 100% and not 0"*.
// The cause was one coercion in both players: `Number(localStorage.getItem(key))` is `Number(null)`
// on a fresh browser, and `Number(null)` is **0**, which is finite — so the absent key slipped past
// the fallback and every first visit started silent. The modules' own default was never heard.
//
// These tests import each module against a storage that answers `null` (a new player), and against
// one holding a real level (a player who has already chosen, silence included). The import is
// cache-busted per case because the level is read once, when the module is evaluated.
//
//   node --test tests/unit/audiovolume.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

/** A browser's `localStorage`, in memory. */
const store = new Map();
const fakeStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
  clear: () => store.clear(),
};

/** Install the fake over whatever this Node has, and hand back the undo. */
function withStorage() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeStorage, configurable: true, writable: true,
  });
  return () => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  };
}

/** Both players, imported fresh so each one reads the store as a page load would. */
async function players(tag) {
  const music = await import(`../../src/game/musicPlayer.js?${tag}`);
  const sfx = await import(`../../src/game/combatSound.js?${tag}`);
  return { music, sfx };
}

test('a player who has never chosen a level hears the music and the world at 100%', async () => {
  store.clear();
  const undo = withStorage();
  try {
    const { music, sfx } = await players('first-run');
    assert.equal(music.getMusicVolume(), 1, 'the first page opens at full music');
    assert.equal(sfx.getSfxVolume(), 1, 'and at full sound');
  } finally { undo(); }
});

test('a level the player did choose is still obeyed, silence included', async () => {
  store.clear();
  store.set('pa.music.volume', '0');
  store.set('pa.sfx.volume', '0.35');
  const undo = withStorage();
  try {
    const { music, sfx } = await players('chosen');
    assert.equal(music.getMusicVolume(), 0, 'a muted score stays muted');
    assert.equal(sfx.getSfxVolume(), 0.35, 'and a level set by hand is remembered');
  } finally { undo(); }
});

test('an empty key is no choice, not a mute', async () => {
  store.clear();
  store.set('pa.music.volume', '');
  store.set('pa.sfx.volume', '');
  const undo = withStorage();
  try {
    const { music, sfx } = await players('empty');
    assert.equal(music.getMusicVolume(), 1);
    assert.equal(sfx.getSfxVolume(), 1);
  } finally { undo(); }
});
