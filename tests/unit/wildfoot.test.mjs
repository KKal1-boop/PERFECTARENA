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
  saveLastLocation({ name: 'Daggerfall', dungeon: false, wild: { row: 132, col: 71.7 } });
  const loaded = loadLastLocation();
  assert.deepEqual(loaded, { name: 'Daggerfall', dungeon: false, wild: { row: 132, col: 72 } });
});

test('a city arrival clears the wild foot', () => {
  saveLastLocation({ name: 'Daggerfall', dungeon: false, wild: { row: 60, col: 60 } });
  saveLastLocation({ name: 'Daggerfall', dungeon: false });
  const loaded = loadLastLocation();
  assert.equal(loaded.name, 'Daggerfall');
  assert.deepEqual(loaded.wild, null);
  assert.equal(loaded.dungeon, false);
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
