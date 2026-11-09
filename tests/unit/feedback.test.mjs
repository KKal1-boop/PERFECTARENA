// THE FIGHT'S READOUT — Daggerfall's hit numbers, damage flash and target card, and Arena's
// key-ID law. Every model here is pure, so the whole readout can be walked without a page.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HIT_SCATTER_PX, healNumberFor, hitNumberFor, playerDamageNumber, wordNumber,
} from '../../src/game/hitNumbers.js';
import {
  FLASH_ALPHA, FLASH_FADE_SPEED, createDamageFlash, screenDrops,
} from '../../src/game/damageFlash.js';
import { KEY_INVENTORY_SIZE, addKey, keyIdForLock, keyOpens, removeKey } from '../../src/game/doors.js';

test('a hit number is the formula’s own answer, tagged, never a second opinion', () => {
  assert.deepEqual(hitNumberFor({ hit: true, damage: 7 }), { kind: 'hit', text: '7', tag: null });
  assert.deepEqual(hitNumberFor({ hit: true, damage: 7, critical: true }), { kind: 'crit', text: '7', tag: null });
  assert.deepEqual(hitNumberFor({ hit: true, damage: 7, backstab: true }), { kind: 'crit', text: '7', tag: 'Backstab' });
  assert.deepEqual(hitNumberFor({ hit: false }), { kind: 'miss', text: 'Miss', tag: null });
  assert.deepEqual(hitNumberFor({ hit: true, ineffective: true }), { kind: 'ineffective', text: 'Ineffective', tag: null });
  assert.deepEqual(hitNumberFor({ hit: true, damage: 0 }), { kind: 'absorbed', text: '0', tag: null });
  assert.deepEqual(hitNumberFor({ hit: true, damage: 3, blocked: true }), { kind: 'blocked', text: 'Blocked', tag: null });
  assert.equal(hitNumberFor(null), null);
  assert.deepEqual(playerDamageNumber({ damage: 5 }), { kind: 'taken', text: '-5', tag: null });
  assert.deepEqual(playerDamageNumber({ damage: 0, blocked: true }), { kind: 'blocked', text: 'Blocked', tag: null });
  assert.deepEqual(playerDamageNumber({ damage: 4, spell: true }), { kind: 'taken', text: '-4', tag: 'spell' });
  assert.equal(playerDamageNumber({ damage: 0 }), null);
  assert.equal(healNumberFor(null, 10), null);
  assert.deepEqual(healNumberFor(10, 13), { kind: 'heal', text: '+3', tag: null });
  assert.equal(healNumberFor(13, 10), null);
  assert.deepEqual(wordNumber('Stagger'), { kind: 'word', text: 'Stagger', tag: null });
  assert.equal(HIT_SCATTER_PX, 36);
});

test('Daggerfall’s damage flash starts at 0.4 and fades at 0.7 a real second', () => {
  const flash = createDamageFlash();
  assert.equal(flash.alpha, 0);
  flash.flash();
  assert.equal(flash.alpha, FLASH_ALPHA);
  flash.tick(0.1);
  assert.ok(Math.abs(flash.alpha - (FLASH_ALPHA - FLASH_FADE_SPEED * 0.1)) < 1e-9);
  flash.tick(1);
  assert.equal(flash.alpha, 0);
  assert.equal(flash.fading, false);
  flash.flash(0.2);
  assert.equal(flash.alpha, 0.2);
  flash.clear();
  assert.equal(flash.alpha, 0);
});

test('a blow that takes a tenth of a life throws the first screen drop; half a life throws five', () => {
  assert.equal(screenDrops(0.05), 0);
  assert.equal(screenDrops(0.1), 1);
  assert.equal(screenDrops(0.5), 5);
  assert.equal(screenDrops(1), 5);
});

test('Arena’s key id is (lockLevel - 1) % 12, and a spent key leaves the ring', () => {
  assert.equal(keyIdForLock(1), 0);
  assert.equal(keyIdForLock(10), 9);
  assert.equal(keyIdForLock(13), 0);
  assert.equal(keyIdForLock(255), 2);
  assert.equal(keyIdForLock(0), -1);
  const ring = [{ lock: 13, keyId: 0, label: 'a key' }, { lock: 4, keyId: 3, label: 'another' }];
  assert.equal(keyOpens(ring, 1), ring[0], 'a level-1 lock takes the type-0 key, even from a level-13 key');
  assert.equal(keyOpens(ring, 2), null, 'a type-1 lock has no key');
  assert.deepEqual(removeKey(ring, ring[0]), [ring[1]]);
  // A save written before key ids: the old level match still finds a key rather than losing it.
  assert.equal(keyOpens([{ lock: 10 }], 10)?.lock, 10);
});

test('Arena’s key ring holds twelve types, and a second key of one type is not stacked', () => {
  const first = addKey([], { lock: 13, keyId: 0, label: 'a key' });
  assert.equal(first.ok, true);
  assert.equal(first.keys.length, 1);
  const duplicate = addKey(first.keys, { lock: 1, keyId: 0, label: 'another key' });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.keys.length, 1, 'the same key type is one slot');
  assert.match(duplicate.reason, /already carry/);
  const full = Array.from({ length: KEY_INVENTORY_SIZE }, (_, i) => ({ lock: i + 1, keyId: i }));
  const refused = addKey(full, { lock: 14, keyId: 12 });
  assert.equal(refused.ok, false, 'a thirteenth key does not fit');
  assert.equal(refused.keys.length, KEY_INVENTORY_SIZE);
  assert.match(refused.reason, /only 12 keys/);
});
