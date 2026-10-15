// The town's paths, held to the two things that matter: a person walks a way that exists, and a
// search the frame's budget cut short is **not** remembered as "no way".
//
// The second one is the whole reason `findTownPath` answers three things instead of two. A
// search that ran out of cells in the middle would, if it answered null, put "this town is
// walled off" in the path book for the rest of the day — every person standing still in a city
// whose first frame happened to be busy.
//
// The pictures below are ring-walled (the level's own outer ring is never a street: a player who
// walks to it walks off the map), with buildings inside.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_ASKS_PER_FRAME, PATH_CELLS_PER_FRAME, createPathBook, findTownPath, pathLine,
  pointOnLine, townGrid,
} from '../../src/game/townPaths.js';

/**
 * A level out of a picture: `#` is a building and `.` a street cell.
 * @param {string[]} rows
 */
function levelOf(rows) {
  const depth = rows.length;
  const width = rows[0].length;
  const cells = [];
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const wall = rows[row][col] === '#';
      cells.push({ solid: wall, kind: wall ? 'wall' : 'air', floor: { chasm: null } });
    }
  }
  return townGrid({ level: { width, depth, cells } });
}

/** A street that runs round a block: the middle column is a building above and below row 3. */
const RING = [
  '#######',
  '#..#..#',
  '#..#..#',
  '#.....#',
  '#..#..#',
  '#..#..#',
  '#######',
];

/** The same, with the block running the whole height: the two sides are sealed from each other. */
const SPLIT = [
  '#######',
  '#..#..#',
  '#..#..#',
  '#..#..#',
  '#..#..#',
  '#..#..#',
  '#######',
];

test('the grid reads the picture: a building is not walkable, a street cell is, the ring never is', () => {
  const nav = levelOf(RING);
  assert.equal(nav.open(0, 0), false, 'the level’s own outer ring is not a street');
  assert.equal(nav.open(3, 0), false, 'nor the rest of it');
  assert.equal(nav.open(1, 1), true);
  assert.equal(nav.open(1, 3), false, 'a building');
  assert.equal(nav.open(3, 3), true, 'the street that runs between them');
});

test('a path is a way that exists, both ends included and every step a street cell', () => {
  const nav = levelOf(RING);
  const path = findTownPath(nav, [1, 1], [1, 5]);
  assert.ok(Array.isArray(path), 'there is a way round the block');
  assert.deepEqual(path[0], [1, 1]);
  assert.deepEqual(path.at(-1), [1, 5]);
  for (const [row, col] of path) assert.ok(nav.open(row, col), `${row},${col} is not walkable`);
  for (let i = 1; i < path.length; i++) {
    assert.equal(Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]), 1, 'a diagonal step');
  }
  // Both sides of the block are four cells, and the street between them is the row in the middle:
  // two down, four across, two up. Counted by hand off the picture rather than off the search.
  assert.equal(path.length, 9, `the shortest walk round the block: ${JSON.stringify(path)}`);
  assert.deepEqual(path[4], [3, 3], 'and it goes through the gap rather than round the outside');
});

test('the same two ends always give the same walk', () => {
  const nav = levelOf(RING);
  const once = findTownPath(nav, [1, 1], [1, 5]);
  const twice = findTownPath(nav, [1, 1], [1, 5]);
  assert.deepEqual(once, twice);
});

test('a block with no way round answers null, and is not a path of two cells', () => {
  const nav = levelOf(SPLIT);
  assert.equal(findTownPath(nav, [1, 1], [1, 5]), null, 'the block runs the whole height');
  assert.ok(Array.isArray(findTownPath(nav, [1, 1], [1, 2])), 'and the same side is still walkable');
});

test('an end that is not walkable is no walk at all', () => {
  const nav = levelOf(RING);
  assert.equal(findTownPath(nav, [1, 3], [3, 3]), null, 'starting inside a building');
  assert.equal(findTownPath(nav, [1, 1], [9, 9]), null, 'off the grid');
  assert.deepEqual(findTownPath(nav, [1, 1], [1, 1]), [[1, 1]], 'standing still is a path of one');
});

test('a search the frame’s budget cut short answers neither way nor "no way"', () => {
  const nav = levelOf(RING);
  const budget = { value: 2 };
  const cut = findTownPath(nav, [1, 1], [1, 5], { cells: budget });
  assert.equal(cut, undefined, 'cut short is not an answer');
  assert.ok(budget.value <= 0, 'and the budget was really spent');
  const whole = findTownPath(nav, [1, 1], [1, 5], {});
  assert.ok(Array.isArray(whole), 'asked again with room to think, it answers');
});

test('the path book keeps answers, asks once, and never keeps a cut-short search as a wall', () => {
  const nav = levelOf(RING);
  const book = createPathBook(nav);
  book.frame(PATH_CELLS_PER_FRAME, PATH_ASKS_PER_FRAME);
  assert.equal(book.get([1, 1], [1, 5]), undefined, 'nobody has asked yet');
  assert.equal(book.want([1, 1], [1, 5]), undefined, 'asked, and waiting for its turn');
  assert.equal(book.waiting(), 1);
  book.run();
  const kept = book.get([1, 1], [1, 5]);
  assert.ok(Array.isArray(kept) && kept.length === 9, 'the run searched it and the book kept it');
  assert.equal(book.waiting(), 0);

  // A frame with one cell to spend cannot finish the walk round the block…
  const starved = createPathBook(nav);
  starved.frame(1, PATH_ASKS_PER_FRAME);
  assert.equal(starved.want([1, 1], [1, 5]), undefined);
  starved.run();
  assert.equal(starved.get([1, 1], [1, 5]), undefined, 'still unanswered rather than answered "no"');
  assert.equal(starved.waiting(), 1, 'and still on the queue for the next frame');
  // …and the next frame, with room, finishes it.
  starved.frame(PATH_CELLS_PER_FRAME, PATH_ASKS_PER_FRAME);
  starved.run();
  assert.ok(Array.isArray(starved.get([1, 1], [1, 5])), 'the walk survives a busy frame');
});

test('a walk with no way is remembered as no way, so it is not asked for every frame', () => {
  const nav = levelOf(SPLIT);
  const book = createPathBook(nav);
  book.frame();
  book.want([1, 1], [1, 5]);
  book.run();
  assert.equal(book.get([1, 1], [1, 5]), null, 'kept, and known to be nowhere');
  assert.equal(book.waiting(), 0);
});

test('a doorway is walkable even though its leaf is solid', () => {
  const rows = [...RING];
  const level = {
    width: rows[0].length,
    depth: rows.length,
    cells: [],
  };
  for (const row of rows) for (const ch of row) level.cells.push({ solid: ch === '#', kind: ch === '#' ? 'wall' : 'air', floor: { chasm: null } });
  const nav = townGrid({ level, extraOpen: (row, col) => row === 1 && col === 3 });
  assert.equal(nav.open(1, 3), true, 'the door’s own street cell is a way through');
  assert.ok(Array.isArray(findTownPath(nav, [1, 1], [1, 5])), 'and it shortens the walk');
});

test('a path’s line keeps the corners and its length is its own', () => {
  // Cells are [row, col]; a point is [x, z] with x along the row and z along the column.
  const line = pathLine([[0, 0], [0, 1], [0, 2], [1, 2]], 2.5);
  assert.deepEqual(line.pts, [[1.25, 1.25], [1.25, 6.25], [3.75, 6.25]]);
  assert.equal(line.len, 7.5);
  const start = pointOnLine(line, 0);
  assert.equal(start.x, 1.25);
  assert.equal(start.z, 1.25);
  assert.equal(start.yaw, 0, 'a walk along +z (the column)');
  const end = pointOnLine(line, 99);
  assert.equal(end.x, 3.75);
  assert.equal(end.z, 6.25, 'clamped to the end of the line');
});
