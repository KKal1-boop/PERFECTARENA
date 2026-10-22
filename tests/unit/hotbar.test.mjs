// THE HOTBAR (2026-10-22): ten cells, the digits, and what a cell may hold.
//
// The owner: *"the hotbar should be for you to put things you have in the inventory and spells
// into, not the normal features of arena you can already click buttons to use"*, and *"i need
// to be able to unpin stuff from the hotbar if its already pinned"*.
// `game/hotbar.js` is the law — a cell holds a potion, a scroll or a spell, the strip starts
// empty, a pin is written on the character, it can be found and cleared again, and a cell that
// names something the player no longer has reads as unusable rather than as a promise.
//
// Run:  node --test tests/unit/hotbar.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HOTBAR_SLOTS, assignSlot, clearSlot, describeEntry, firstFreeSlot,
  hotbarOf, hotbarRows, isEntry, slotFromCode, slotKey, slotOf,
} from '../../src/game/hotbar.js';

test('the strip is ten cells, keyed 1…9 and 0, and a fresh character has none filled', () => {
  assert.equal(HOTBAR_SLOTS, 10);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => slotKey(i)), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  assert.equal(slotKey(10), '');
  assert.equal(slotKey(-1), '');
  assert.deepEqual(hotbarOf(null), Array(10).fill(null));
  assert.deepEqual(hotbarOf({ hotbar: ['strike', 'pack'] }), Array(10).fill(null));
});

test('a digit key finds its cell, and nothing else does', () => {
  assert.equal(slotFromCode('Digit1'), 0);
  assert.equal(slotFromCode('Digit9'), 8);
  assert.equal(slotFromCode('Digit0'), 9);
  assert.equal(slotFromCode('Numpad7'), 6);
  assert.equal(slotFromCode('KeyW'), -1);
  assert.equal(slotFromCode(null), -1);
});

test('a saved pin rides on the character; anything else is an empty cell', () => {
  const saved = { hotbar: Array(10).fill(null) };
  saved.hotbar[4] = { kind: 'spell', name: 'Fire Dart' };
  const cells = hotbarOf(saved);
  assert.equal(cells[4].name, 'Fire Dart');
  assert.equal(cells[0], null);
  const junk = { hotbar: [{ kind: 'nonsense' }, { kind: 'spell' }, { kind: 'action', id: 'strike' }] };
  assert.deepEqual(hotbarOf(junk), Array(10).fill(null));
});

test('pinning writes a new character, finds the first empty cell, and never mutates', () => {
  const before = { name: 'Tester', hotbar: undefined };
  const pinned = assignSlot(before, 0, { kind: 'spell', name: 'Light Heal' });
  assert.equal(before.hotbar, undefined, 'the old sheet is untouched');
  assert.equal(pinned.hotbar[0].name, 'Light Heal');
  assert.equal(pinned.name, 'Tester');
  assert.equal(firstFreeSlot(pinned), 1);
  assert.equal(firstFreeSlot(before), 0);
  assert.equal(assignSlot(pinned, 20, { kind: 'spell', name: 'x' }), pinned);
  assert.equal(assignSlot(pinned, 2, { kind: 'nonsense' }), pinned);
  assert.equal(assignSlot(pinned, 2, { kind: 'action', id: 'strike' }), pinned);
});

test('a pinned thing is found by kind and name, so it can be unpinned', () => {
  const pinned = assignSlot({}, 3, { kind: 'item', id: 'potion-heal' });
  assert.equal(slotOf(pinned, 'item', 'potion-heal'), 3);
  assert.equal(slotOf(pinned, 'item', 'potion-cure'), -1);
  assert.equal(slotOf(pinned, 'spell', 'potion-heal'), -1);
  const spell = assignSlot(pinned, 7, { kind: 'spell', name: 'Shield' });
  assert.equal(slotOf(spell, 'spell', 'Shield'), 7);
  const cleared = clearSlot(spell, 3);
  assert.equal(slotOf(cleared, 'item', 'potion-heal'), -1);
  assert.equal(slotOf(cleared, 'spell', 'Shield'), 7, 'unpinning one cell leaves the others');
});

test('filling every cell leaves no free slot', () => {
  let character = {};
  for (let i = 0; i < HOTBAR_SLOTS; i++) character = assignSlot(character, i, { kind: 'item', id: `potion-${i}` });
  assert.equal(firstFreeSlot(character), -1);
  assert.equal(hotbarOf(character).filter(Boolean).length, 10);
});

test('clearing a cell empties it', () => {
  const pinned = assignSlot({}, 6, { kind: 'item', id: 'potion-heal' });
  const cleared = clearSlot(pinned, 6);
  assert.equal(hotbarOf(cleared)[6], null);
  assert.equal(clearSlot(cleared, 99).hotbar.length, 10);
  assert.equal(clearSlot({}, 3).hotbar.length, 10);
});

test('a cell describes itself, and says when it cannot be pressed', () => {
  const world = { knownSpells: ['Light Heal'], hasItem: (id) => id === 'potion-heal', itemName: (id) => (id === 'potion-heal' ? 'Potion of Healing' : id) };
  const empty = describeEntry(null, world);
  assert.equal(empty.kind, 'empty');
  assert.equal(empty.available, false);
  assert.match(empty.hint, /pin a potion/i);
  assert.equal(describeEntry({ kind: 'spell', name: 'Light Heal' }, world).available, true);
  const lost = describeEntry({ kind: 'spell', name: 'Fire Dart' }, world);
  assert.equal(lost.available, false);
  assert.match(lost.hint, /not in your book/);
  assert.equal(describeEntry({ kind: 'item', id: 'potion-heal' }, world).label, 'Potion of Healing');
  const gone = describeEntry({ kind: 'item', id: 'potion-heal' }, { ...world, hasItem: () => false });
  assert.equal(gone.available, false);
  assert.match(gone.hint, /not in your pack/);
  assert.equal(describeEntry({ kind: 'nonsense' }, world).kind, 'empty');
});

test('the rows are what the strip draws: key, label, kind and availability', () => {
  const character = { hotbar: Array(10).fill(null) };
  character.hotbar[4] = { kind: 'spell', name: 'Fire Dart' };
  const rows = hotbarRows(character, { knownSpells: [], hasItem: () => false });
  assert.equal(rows.length, 10);
  assert.equal(rows[4].key, '5');
  assert.equal(rows[4].label, 'Fire Dart');
  assert.equal(rows[4].available, false);
  assert.equal(rows[0].kind, 'empty');
  assert.equal(rows[9].key, '0');
});

test('only spells and items are entries', () => {
  assert.equal(isEntry({ kind: 'spell', name: 'Shield' }), true);
  assert.equal(isEntry({ kind: 'item', id: 'potion-heal' }), true);
  assert.equal(isEntry({ kind: 'action', id: 'cast' }), false);
  assert.equal(isEntry({ kind: 'action', id: 'fly' }), false);
  assert.equal(isEntry({ kind: 'spell', name: '' }), false);
  assert.equal(isEntry(null), false);
});
