// THE FLOW FIELD: one search, every creature's next step, and no corner cutting.
//
// The owner, 2026-10-19: *"they need to be able to make their way around walls so they need to have
// better pathfinding"*. `game/navFlow.js` is the search; this holds it against a maze it cannot
// solve by walking in a straight line, which is the shape the sliding step failed.
//
// Run:  node --test tests/unit/navflow.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEIGHBOURS_8, NO_STEP, buildFlow, directionWord, retreatFrom, stepFrom } from '../../src/game/navFlow.js';

/** A room with a wall down the middle and one doorway, as rows of `#` (stone) and `.` (floor). */
const MAZE = [
  '#########',
  '#...#...#',
  '#...#...#',
  '#...#...#',
  '#.......#',
  '#...#...#',
  '#...#...#',
  '#...#...#',
  '#########',
];
const AT = (row, col) => MAZE[row][col] === '.';
const WIDTH = MAZE[0].length;
const DEPTH = MAZE.length;

test('the search reaches the far side of a wall it cannot see through', () => {
  // The player stands in the left room; the creature starts in the right one, three rows up.
  const flow = buildFlow({ walkable: AT, width: WIDTH, depth: DEPTH, goal: { row: 1, col: 1 } });
  assert.ok(flow.reached > 20, `${flow.reached} cells reached`);
  // Every room cell is reachable — the doorway on row 4 is the way through, and nothing sealed.
  for (let row = 0; row < DEPTH; row++) {
    for (let col = 0; col < WIDTH; col++) {
      if (!AT(row, col)) continue;
      assert.ok(flow.dist[row * WIDTH + col] >= 0, `(${row},${col}) is reached`);
    }
  }
  // Walk the creature's own steps from the far room and it must arrive, around the wall.
  let row = 2;
  let col = 7;
  const trail = [];
  for (let i = 0; i < 40 && !(row === 1 && col === 1); i++) {
    const step = stepFrom(flow, row, col);
    assert.ok(step, `(${row},${col}) has a next step`);
    row += step.dRow;
    col += step.dCol;
    trail.push(`${row},${col}`);
    assert.ok(AT(row, col), `(${row},${col}) is floor`);
  }
  assert.deepEqual([row, col], [1, 1], `the walk ended at the player: ${trail.join(' → ')}`);
  // …and the route is the short one: the doorway is on row 4, so the walk must visit it.
  assert.ok(trail.includes('4,4'), `the walk goes through the doorway: ${trail.join(' → ')}`);
});

test('a diagonal is only taken when both of its sides are open', () => {
  // A single stone cell with floor on all eight sides: stepping diagonally past it is legal, and
  // stepping *through* it is not. The field must never answer a step into stone.
  const grid = [
    '.....',
    '.....',
    '..#..',
    '.....',
    '.....',
  ];
  const floor = (row, col) => grid[row]?.[col] === '.';
  const flow = buildFlow({ walkable: floor, width: 5, depth: 5, goal: { row: 0, col: 0 } });
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const step = stepFrom(flow, row, col);
      if (!step) continue;
      assert.ok(floor(row + step.dRow, col + step.dCol), `(${row},${col}) steps onto floor`);
      if (step.dRow && step.dCol) {
        assert.ok(floor(row + step.dRow, col) && floor(row, col + step.dCol),
          `(${row},${col}) does not cut the corner`);
      }
    }
  }
  // The stone itself has no step and no distance.
  assert.equal(flow.dist[2 * 5 + 2], -1);
  assert.equal(stepFrom(flow, 2, 2), null);
});

test('a sealed room is unreachable, and that is answered rather than guessed', () => {
  const grid = [
    '#######',
    '#..#..#',
    '#..#..#',
    '#..#..#',
    '#######',
  ];
  const floor = (row, col) => grid[row]?.[col] === '.';
  const flow = buildFlow({ walkable: floor, width: 7, depth: 5, goal: { row: 1, col: 1 } });
  assert.equal(flow.dist[1 * 7 + 5], -1, 'the sealed room is not in the field');
  assert.equal(stepFrom(flow, 1, 5), null);
  // A cell outside the grid, an empty flow and a goal off the map are all "no step", not a crash.
  assert.equal(stepFrom(flow, -1, 0), null);
  assert.equal(stepFrom(null, 0, 0), null);
  assert.equal(buildFlow({ walkable: floor, width: 0, depth: 0, goal: { row: 0, col: 0 } }).reached, 0);
  assert.equal(buildFlow({ walkable: floor, width: 7, depth: 5, goal: { row: 99, col: 0 } }).reached, 0);
});

test('a flight is the same field read backwards, and it never walks into stone', () => {
  const flow = buildFlow({ walkable: AT, width: WIDTH, depth: DEPTH, goal: { row: 4, col: 4 } });
  // From the doorway, the way *out* of the player's reach is into one of the two rooms.
  const away = retreatFrom(flow, AT, 4, 4);
  assert.ok(away, 'there is somewhere to run');
  assert.ok(AT(4 + away.dRow, 4 + away.dCol), 'and it is floor');
  // Every floor cell's retreat is floor, and it increases the distance from the player.
  for (let row = 0; row < DEPTH; row++) {
    for (let col = 0; col < WIDTH; col++) {
      if (!AT(row, col)) continue;
      const step = retreatFrom(flow, AT, row, col);
      if (!step) continue;
      assert.ok(AT(row + step.dRow, col + step.dCol), `(${row},${col}) retreats onto floor`);
      const before = flow.dist[row * WIDTH + col];
      const after = flow.dist[(row + step.dRow) * WIDTH + (col + step.dCol)];
      assert.ok(after > before, `(${row},${col}) opens the gap: ${before} → ${after}`);
    }
  }
  // A cell the player is standing on has nowhere farther to go inside its own cell, and a stone
  // cell is not a place to run from.
  assert.equal(retreatFrom(flow, AT, 0, 0), null);
});

test('the direction words are the ones %di is written for', () => {
  assert.equal(directionWord('north'), 'north');
  assert.equal(directionWord('southWest'), 'south-west');
  assert.equal(directionWord('northEast'), 'north-east');
  assert.equal(directionWord(null), 'east');
  // The eight neighbours are eight distinct steps, and the search uses all of them.
  assert.equal(NEIGHBOURS_8.length, 8);
  assert.equal(new Set(NEIGHBOURS_8.map(([r, c]) => `${r},${c}`)).size, 8);
  assert.equal(NO_STEP, 127);
});
