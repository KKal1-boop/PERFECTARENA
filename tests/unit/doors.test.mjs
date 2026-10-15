// Run:  node --test tests/unit/doors.test.mjs
//
// The door law without a browser (`src/game/doors.js`): which doors the level's own `LOCK`
// chunk says are locked, what an arm can force and what it cannot, **where the keys are**, and
// what the game says to a player standing in a doorway.
//
// The laws that matter, and the defects they exist for:
//
//   * a lock **always has a key** when forcing it is a gamble (`KEYWORTHY_LOCK`) — the pass that
//     added the keys found the Imperial Dungeons' own cell door (lock 10, a 25 % shove) with no
//     key anywhere in the level, which a player reads as "this door cannot be opened";
//   * a key lies on the **player's side** of its door and as far in as the reachable area allows,
//     so finding it is the point of the level rather than a formality;
//   * a lock above `HAND_FORCE_MAX` is refused by hand and says it wants a key.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORCE_FAILED, HAND_FORCE_MAX, KEYWORTHY_LOCK, NEEDS_KEY, doorLine, forceChance, keyOpens,
  lockAt, lockTable, openReason, placeKeys,
} from '../../src/game/doors.js';

/** A square room of open floor: `size × size`, nothing solid unless the caller says so. */
function room(size = 12, solid = () => false) {
  const cells = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      cells.push({ solid: solid(row, col), floor: { chasm: false } });
    }
  }
  return { width: size, depth: size, height: size, cells };
}

test('the level\'s own LOCK chunk is read as x=column, y=row, and a door keeps its worst lock', async () => {
  const locks = lockTable({ lock: [{ x: 4, y: 23, lockLevel: 10 }] });
  assert.equal(lockAt(locks, 23, 4), 10, 'column 4, row 23 — the pair the shipped dungeons use');
  assert.equal(lockAt(locks, 4, 23), 0, 'and not the other way round');
  assert.equal(lockAt(locks, 1, 1), 0, 'a cell with no entry is not locked');
  // Two entries on one cell: the higher lock is the one that holds.
  const doubled = lockTable({ lock: [{ x: 2, y: 2, lockLevel: 4 }, { x: 2, y: 2, lockLevel: 9 }] });
  assert.equal(lockAt(doubled, 2, 2), 9);
  assert.equal(lockTable(null).size, 0, 'a level with no LOCK chunk has no locks');
});

test('what an arm can force: less likely as the lock rises, and never above the limit', async () => {
  assert.equal(forceChance(50, 0), 1, 'an unlocked door opens');
  assert.ok(forceChance(50, 4) > forceChance(50, 10), 'a heavy lock is harder than a light one');
  assert.ok(forceChance(90, 10) > forceChance(10, 10), 'a stronger arm does better on the same lock');
  assert.equal(forceChance(100, HAND_FORCE_MAX + 1), 0, 'a sealed lock is not a matter of muscle');
  assert.equal(forceChance(-500, 10), 0.05, 'never impossible for a forceable lock, and never certain');
  assert.equal(forceChance(99999, 1), 0.95, 'and never certain from the other side either');
});

test('every lock worth a key has one, on the player\'s side and deep in the level', async () => {
  const level = room(20);
  // A spawn as the scene passes it: **cell-centre world units**, `x` the column and `z` the row
  // (the `.MIF` convention the module reads — `Math.round(spawn.z - 0.5)` is a row).
  const spawn = { x: 1.5, z: 1.5 };
  const arrive = { row: 1, col: 1 };
  // One door in the middle of the room, held by the Imperial Dungeons' own lock level.
  const doors = [{ row: 10, col: 10, lockLevel: 10 }];
  const keys = placeKeys({ level, doors, spawn });
  assert.equal(keys.length, 1, 'the lock has a key');
  assert.equal(keys[0].lock, 10, 'and it is that lock\'s key');
  assert.equal(keys[0].art, 'KEY.IMG', 'and it is drawn as the install\'s own key');
  const away = Math.hypot(keys[0].row - arrive.row, keys[0].col - arrive.col);
  assert.ok(away >= 6, `the key is not on the doorstep: ${JSON.stringify(keys[0])} is ${away.toFixed(1)} cells off`);
  assert.ok(level.cells[keys[0].row * level.width + keys[0].col], 'and it lies on a cell of the level');
  assert.notDeepEqual([keys[0].row, keys[0].col], [doors[0].row, doors[0].col], 'not inside the door');
  assert.deepEqual(keyOpens(keys, 10), keys[0], 'and turning it opens that lock');
  assert.equal(keyOpens(keys, 11), null, 'while it does not open a heavier one');

  // **A trivial lock gets no key**: below `KEYWORTHY_LOCK` the arm is the way through.
  assert.equal(placeKeys({ level, doors: [{ row: 10, col: 10, lockLevel: KEYWORTHY_LOCK - 1 }], spawn }).length, 0);
  assert.equal(placeKeys({ level, doors: [], spawn }).length, 0, 'no locks, no keys');

  // Two locks of different levels: a key each, on different cells.
  const pair = placeKeys({ level, doors: [{ row: 4, col: 4, lockLevel: 8 }, { row: 16, col: 16, lockLevel: 70 }], spawn });
  assert.equal(pair.length, 2, 'one key per lock level');
  assert.notDeepEqual([pair[0].row, pair[0].col], [pair[1].row, pair[1].col], 'two keys, two cells');
});

test('a key is on the near side of the door it opens, read from an x=row, z=column spawn', async () => {
  // A wall across the level with the locked door in it: the far half is only reachable *through*
  // the door, so a key placed out there would be behind the lock it opens.
  //
  // **The spawn is deliberately lopsided** (x 3.5, z 15.5 → row 3, column 15). The scene's own
  // convention is `row = spawn.x - 0.5, col = spawn.z - 0.5` — `interior.js` places its people
  // from exactly that pair — and this module used to read it the other way round: from the
  // transposed cell the player in this level is *below* the wall, so the key would come out on
  // the far side of a sealed door, which is where the bug showed in the game (the Imperial
  // Dungeons reported "1 locked, 0 keys placed").
  const level = room(20, (row, col) => row === 10 && col !== 5);
  const doors = [{ row: 10, col: 5, lockLevel: 12 }];
  const keys = placeKeys({ level, doors, spawn: { x: 3.5, z: 15.5 } });
  assert.equal(keys.length, 1);
  assert.ok(keys[0].row < 10, `the key is on the player's side of the wall: ${JSON.stringify(keys[0])}`);
});

test('a room too small to be deep still gets its key: the first room of the Imperial Dungeons', async () => {
  // The Imperial Dungeons begin in a pocket of fourteen cells whose only way out is its own
  // locked cell door (lock level 10 — a one-in-four shove). The key `placeKeys` placed was
  // refused for being nearer than six cells of the arrival, so the level had a locked door and
  // **no key in it at all**: the reported "there isn't even a key to open the door in front of
  // you". The far end of what is reachable is the rule, however near that is.
  const level = room(10, (row, col) => row > 3 || col > 3);   // a 4×4 room in the corner
  const doors = [{ row: 3, col: 4, lockLevel: 10 }];
  const keys = placeKeys({ level, doors, spawn: { x: 1.5, z: 1.5 } });
  assert.equal(keys.length, 1, 'the room gets its key');
  assert.ok(keys[0].row < 4 && keys[0].col < 4, `and it lies in the room: ${JSON.stringify(keys[0])}`);
  assert.notDeepEqual([keys[0].row, keys[0].col], [1, 1], 'not under the player’s own feet while there is floor to spare');
});

test('a door tells the player what it is, and what it needs', async () => {
  assert.match(doorLine({ open: true, kind: 'swinging', locked: false, lockLevel: 0 }), /stands open/);
  assert.match(doorLine({ open: false, kind: 'sliding', locked: false, lockLevel: 0 }), /press E to open it/);
  // A lock worth a key **says so** — a player told only to shove has no way to know the level
  // holds the sure way through.
  const worthy = doorLine({ open: false, kind: 'swinging', locked: true, lockLevel: KEYWORTHY_LOCK });
  assert.match(worthy, /press E to force it, or find the key/);
  assert.match(doorLine({ open: false, kind: 'swinging', locked: true, lockLevel: 2 }), /press E to force it\.$/);
  assert.match(doorLine({ open: false, kind: 'raising', locked: true, lockLevel: HAND_FORCE_MAX + 1 }), /wants a key/);
  assert.equal(openReason('key'), 'The key turns and the lock gives.');
  assert.equal(openReason('forced'), 'The lock gives with a shove.');
  assert.equal(openReason('nothing'), null);
  assert.match(FORCE_FAILED, /find the key/, 'a failed shove points at the key, which exists');
  assert.match(NEEDS_KEY, /wants a key/);
});

test('a key opens the lock it was cut for, and a heavier lock only for a heavier key', async () => {
  const light = { lock: 4 };
  const heavy = { lock: 12 };
  assert.equal(keyOpens([light, heavy], 4), light, 'the ordinary lock takes the ordinary key');
  assert.equal(keyOpens([light, heavy], 12), heavy, 'and the sealed one the sealed key');
  assert.equal(keyOpens([light], 12), null, 'a light key does not open a heavier lock');
  assert.equal(keyOpens([], 10), null, 'no key in hand opens nothing');
  assert.equal(keyOpens([heavy], 0), null, 'and an unlocked door wants no key at all');
});
