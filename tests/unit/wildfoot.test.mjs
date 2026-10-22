// THE SAVE REMEMBERS THE COUNTRY.
//
// The last-location record now carries a `wild` cell — which is the whole difference
// between an outdoor world the player *visits* and one they *live in*: a gate crossed
// last session is the ground they stand on next session. Three rules pinned here:
//
//   1. **the round-trip** — `saveLastLocation` then `loadLastLocation` keeps the cell
//      exactly (it is rounded, because a billboard's position is never a fraction);
//   2. **a city page clears it** — a stale wild cell must never leak into a different
//      settlement's boots;
//   3. **junk never crashes the loader** — a truncated save, a NaN field, or a plain
//      string answer null, the same rule the rest of the save holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
// `strftime`-free; the save module is localStorage-shaped, so the mock is tiny.
const store = new Map();
const fakeStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.localStorage = fakeStorage;

const { saveLastLocation, loadLastLocation, LAST_LOCATION_KEY } =
  await import('../../src/game/save.js');

test('a saved wild cell survives the save whole, and rounds', () => {
  saveLastLocation({ name: 'Daggerfall', dungeon: false, wild: { row: 132, col: 71.7 }, country: true });
  const loaded = loadLastLocation();
  assert.deepEqual(loaded, {
    name: 'Daggerfall', dungeon: false, seed: null,
    gridVersion: 2, provinceID: null, locationID: null,
    wild: { row: 132, col: 72 }, country: true,
  });
});

test('a city arrival clears the wild foot', () => {
  saveLastLocation({ name: 'Daggerfall', dungeon: false, wild: { row: 60, col: 60 }, country: true });
  saveLastLocation({ name: 'Daggerfall', dungeon: false });
  const loaded = loadLastLocation();
  assert.equal(loaded.name, 'Daggerfall');
  assert.deepEqual(loaded.wild, null);
  assert.equal(loaded.dungeon, false);
  assert.equal(loaded.country, false, 'a city is not the country');
});

test('**the country flag is the country cell\u2019s own shadow** (B26)', () => {
  // The map's own report — *"when im in the wilderness it says im in a city but im not"* — was a
  // record with a name and nothing else: the mark it drew was the named location the page carried,
  // never the ground the player stood on. So a country cell and "I am in the country" travel
  // together, in both directions: a page that sets one without the other is a page the map cannot
  // read honestly.
  saveLastLocation({ name: 'Daggerfall', dungeon: false, wild: { row: 12, col: 34 }, country: true });
  assert.equal(loadLastLocation().country, true);
  saveLastLocation({ name: 'Daggerfall', dungeon: false, wild: null, country: true });
  assert.equal(loadLastLocation().country, false, 'no cell, no country: the flag has nothing to be about');
  saveLastLocation({ name: 'Daggerfall', dungeon: false, wild: { row: 12, col: 34 }, country: false });
  assert.equal(loadLastLocation().country, false, 'and a cell without the flag is not the country');
});

test('junk in storage answers a clean null rather than crashing every boot', () => {
  store.set(LAST_LOCATION_KEY, 'not json at all');
  assert.deepEqual(loadLastLocation(), null);
  store.set(LAST_LOCATION_KEY, JSON.stringify({ name: 'X', dungeon: false, wild: { row: 'a', col: null } }));
  const loaded = loadLastLocation();
  assert.equal(loaded.name, 'X');
  assert.deepEqual(loaded.wild, null, 'a wild cell that is not a number pair is absent, whole');
  store.set(LAST_LOCATION_KEY, 'null');
  assert.deepEqual(loadLastLocation(), null);
});
