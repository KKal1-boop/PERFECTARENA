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
import { ArenaData } from '../../src/arena/arenaData.js';
import { decodeLevel } from '../../src/game/mifLevel.js';
import { triggerRiddle, triggerTable } from '../../src/game/levelTriggers.js';
import { ARENA_TEXTURE_ARCHIVE, buildLevelMesh } from '../../src/game/mifMesh.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import {
  FORCE_FAILED, HAND_FORCE_MAX, KEYWORTHY_LOCK, NEEDS_KEY, SWING_DEGREES, doorLeaf, doorLine,
  forceChance, keyOpens, leafIntoSolid, lockAt, lockTable, openReason, placeKeys,
  riddleAnswerMatches, riddleDoors,
} from '../../src/game/doors.js';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

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
  assert.equal(pair.length, 2, 'one key per sealed door');
  assert.notDeepEqual([pair[0].row, pair[0].col], [pair[1].row, pair[1].col], 'two keys, two cells');
});

test('two sealed doors of the same level get a key each — a key per door, not per number', async () => {
  // The law used to answer one key for each distinct lock *level*. `DAGOTH3` seals four doors
  // at 254 and was given **one** key; `BGATE2` seals four at 57/58/59 and got three. A sealed
  // lock cannot be forced, so the door without a key was a door the main quest could never
  // open — the owner's *"the keys still not work as intended"*. Measured over every shipped
  // dungeon before the change: `DAGOTH3` 4 sealed / 1 key, `BGATE2` 4 / 3.
  const level = room(20);
  const spawn = { x: 1.5, z: 1.5 };
  const twins = placeKeys({
    level, spawn,
    doors: [{ row: 4, col: 4, lockLevel: 254 }, { row: 16, col: 16, lockLevel: 254 }],
  });
  assert.equal(twins.length, 2, 'one key for each 254 door');
  assert.deepEqual(twins.map((key) => key.lock), [254, 254]);
  assert.notDeepEqual(twins[0].door, twins[1].door, 'each key names the door it is for');
  assert.notDeepEqual([twins[0].row, twins[0].col], [twins[1].row, twins[1].col], 'on two different cells');
  assert.deepEqual(keyOpens(twins, 254), twins[0], 'either key opens a 254 lock');
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

test('a swinging leaf stops short of the jamb, and never swings into a wall', async () => {
  // The owner, playing the port beside the original: "when doors open they clip into the wall
  // instead in normal arena they dont".
  //
  // **The cause was the angle.** A panel spans a whole cell and is hinged at one end of that
  // span, so at exactly 90° it comes to rest *in the plane of the wall beside it* — and this port
  // turned **96°**, which drove the far end 0.10 of a cell (26 cm) through that wall. The
  // neighbour is solid by construction: `mifMesh` gives a door `panel: 'x'` only when the two
  // cells it does not swing into are walls. Arena's own margin is OpenTESArena's
  // (`VoxelDoorUtils.cpp`: `maxSwingRadians = Constants::HalfPi - bigEpsilon`, 0.005 rad,
  // "Prevents Z-fighting with 32-bit depth"), and the law is the one below.
  assert.ok(SWING_DEGREES < 90, `the leaf stops short of the wall plane: ${SWING_DEGREES}°`);
  assert.ok(SWING_DEGREES > 89, `…and still clears the doorway: ${SWING_DEGREES}°`);

  // ── the geometry, as the scene draws it ────────────────────────────────────────────────
  const door = { row: 10, col: 4, panel: 'x', kind: 'swinging' };
  const shut = doorLeaf(door, 2.5, 0);
  assert.deepEqual(shut, [{ x: 25, z: 11.25 }, { x: 27.5, z: 11.25 }], 'shut, the leaf spans its own cell');
  const open = doorLeaf(door, 2.5, 1);
  assert.ok(open[1].x < shut[1].x || Math.abs(open[1].x - shut[0].x) < 1e-9,
    `open, the free end has swung round to the hinge: ${JSON.stringify(open)}`);
  // A **slide** is exempt on purpose: it travels into the wall the map leaves hollow for it.
  assert.equal(leafIntoSolid({ row: 10, col: 4, panel: 'x', kind: 'sliding' }, 2.5, 1, () => true), null);

  // ── and the law, against the levels the install ships ──────────────────────────────────
  const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });
  let swinging = 0;
  let violations = [];
  for (const [name, index] of [['START.MIF', 0], ['39300577.MIF', 0], ['IMPPAL.MIF', 1]]) {
    const mif = await data.mif(name);
    const level = mif.levels[index];
    let inf = null;
    try { inf = await data.inf(level.info); } catch { /* a level with no INF still decodes */ }
    const decoded = decodeLevel(level, inf, { width: mif.width, depth: mif.depth ?? mif.height, mapType: 'interior' });
    const built = buildLevelMesh(decoded, { archive: ARENA_TEXTURE_ARCHIVE });
    // A **door cell is solid** in the collision mesh (you cannot walk through a shut one), so the
    // level's own flag is not the question here: the leaf may stand in a doorway. Walls are.
    const isSolid = (row, col) => {
      const cell = decoded.cells?.[row * mif.width + col];
      return !cell || (Boolean(cell.solid) && cell.kind !== 'door');
    };
    for (const leaf of built.doors ?? []) {
      if (leaf.kind !== 'swinging') continue;
      swinging++;
      for (let step = 0; step <= 10; step++) {
        const hit = leafIntoSolid(leaf, 2.5, step / 10, isSolid);
        if (hit && violations.length < 6) {
          violations.push(`${name} L${index} door (${leaf.row},${leaf.col}) ${leaf.panel} at open ${hit.open.toFixed(1)} → (${hit.at.x.toFixed(2)}, ${hit.at.z.toFixed(2)}) is in wall (${hit.row},${hit.col})`);
        } else if (hit) violations.push('…');
      }
    }
  }
  assert.ok(swinging >= 50, `the shipped levels field swinging doors: ${swinging}`);
  assert.deepEqual(violations, [], `${violations.length} of ${swinging} leaves enter a wall`);

  // **Mutation check** (measured 2026-10-16, `.scratch/doorprobe.mjs`, 273 doors across eight
  // levels): at the 96° this port used to turn, **244 of 244 swinging doors** put part of their
  // leaf inside a wall; at 89.714°, 0 of 244. So the two lines above are the whole law, and the
  // constant is what fails when it regresses.
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

test('a riddle door is the door beside its sign, and the install’s own answer opens it', async () => {
  // The owner, 2026-10-21: *"the main quest dungeons should have working keys and puzzles that
  // are not working"*. Every Staff-piece dungeon ships riddles in its `.INF` (`*TEXT` with `^`
  // answers) and a `TRIG` cell in front of the door each one seals, at a lock level no hand can
  // force — `HAND_FORCE_MAX` is 10 and the doors are 255, 90, 125, 56, 29. The port showed the
  // riddle as prose and then let the door be forced or opened with any key, which is no puzzle.
  const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

  // ── the law, on the install's own riddle doors ──────────────────────────────────────────
  const seen = [];
  for (const name of ['39300577.MIF', '39950681.MIF', '40516921.MIF', '40852494.MIF', '41418704.MIF',
    '41649375.MIF', '42026882.MIF', '42068779.MIF', '42488253.MIF']) {
    const mif = await data.mif(name);
    for (const raw of mif.levels) {
      if (!raw.info) continue;
      const inf = await data.inf(raw.info.toUpperCase());
      if (!inf.riddles?.size) continue;
      const level = decodeLevel(raw, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
      const locks = lockTable(raw);
      for (const [key, trigger] of triggerTable(raw)) {
        const riddle = triggerRiddle(inf, trigger);
        if (!riddle) continue;
        const doors = riddleDoors({ level, trigger, locks });
        assert.ok(doors.length > 0,
          `${name} ${raw.name}: the sign at ${key} speaks for no door`);
        assert.ok(doors.every((door) => level.cells[door.row * level.width + door.col].kind === 'door'),
          `${name} ${raw.name}: a riddle target at ${key} is not a door`);
        // **Beside its sign, or the four-exit room.** Adjacent doors win whole; only a sign that
        // stands beside none may speak for the sealed doors within `RIDDLE_REACH`.
        const distance = Math.max(...doors.map((door) => Math.max(Math.abs(door.row - trigger.row), Math.abs(door.col - trigger.col))));
        assert.ok(distance === 1 || doors.length > 1,
          `${name} ${raw.name}: the sign at ${key} reaches ${distance} cells for one door`);
        if (distance > 1) {
          const levels = [...new Set(doors.map((door) => door.lock))];
          assert.equal(levels.length, 1,
            `${name} ${raw.name}: a room-wide sign speaks for doors of one lock, saw ${levels.join(', ')}`);
          if (levels[0] === 254) {
            assert.deepEqual(doors.map((door) => door.lock).sort(), doors.map(() => 254),
              `${name} ${raw.name}: a room-wide riddle opens the sealed exits only`);
          } else {
            // A pressure plate (`crystal3`): the level's own run of cell doors, by its commonest lock.
            assert.ok(levels[0] <= HAND_FORCE_MAX && doors.length > 1,
              `${name} ${raw.name}: a pressure plate speaks for the cells (${doors.length} of lock ${levels[0]})`);
          }
        }
        // And **the answer is the file's**, read in a player's spelling.
        assert.ok(riddle.answers.length > 0, `${name}: riddle ${trigger.textIndex} has no answer`);
        assert.ok(riddleAnswerMatches(riddle, `  ${riddle.answers[0].toUpperCase()}! `),
          `${name}: "${riddle.answers[0]}" does not satisfy its own riddle`);
        assert.equal(riddleAnswerMatches(riddle, 'a wrong answer'), false, `${name}: a wrong answer opened a door`);
        seen.push(`${name}:${raw.name}:${key}→${doors.map((door) => `${door.row},${door.col}@${door.lock}`).join('+')}`);
      }
    }
  }
  assert.ok(seen.length >= 12, `the install's own riddle doors should be found (${seen.length})`);
  assert.ok(seen.some((row) => row.includes('@254')), 'Dagoth-Ur’s four-exit escape room is among them');

  // ── no generic key is minted for a riddle door or the palace seal ──────────────────────
  const level = room(8, (row, col) => row === 7 || col === 7);
  const doors = [
    { row: 6, col: 3, lockLevel: 255, riddle: { answers: ['x'] } },
    { row: 6, col: 5, lockLevel: 25, questSeal: true },
    { row: 6, col: 1, lockLevel: 8 },
  ];
  const keys = placeKeys({ level, doors, spawn: { x: 1.5, z: 1.5 } });
  assert.deepEqual(keys.map((key) => key.lock), [8],
    `only the ordinary lock gets a key: ${JSON.stringify(keys)}`);
  // …and a key of the riddle door's own number opens nothing: the scene refuses a riddle door
  // before `keyOpens` is ever asked (`useLeaf`), which this pins as the law's shape.
  assert.equal(keyOpens([{ lock: 255 }], 8)?.lock, 255, 'an over-level key still opens an ordinary lock');
});
