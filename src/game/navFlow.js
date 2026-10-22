// THE FLOW FIELD — the shortest way from every cell of a level to the player.
//
// The owner, 2026-10-19: *"they need to be able to make their way around walls so they need to have
// better pathfinding"*.
//
// The scene's monsters walked by **sliding**: each axis of a step was tested alone and a refused
// axis simply lost that frame (`if (walkableWorld(nx, z)) x = nx` …). That is enough in a corridor
// and wrong everywhere else: a creature in the next room presses at the corner of the doorway until
// the player comes to it, and one that loses sight mid-chase grinds along the wall it last saw them
// through. Measured on `START.MIF` (`.scratch/probenav.mjs`): four of six roused creatures never
// closed a metre in eight seconds.
//
// A **flow field** is the smallest honest answer: one breadth-first search from the player's cell
// fills every reachable cell with the direction of the next step toward them, so a hundred monsters
// share one search and each one only reads its own cell. It is the same idea the town's own roads
// use (`townPaths.js` — a Dijkstra over the walkable grid), reduced to what a dungeon needs: every
// open cell costs the same, so plain BFS is the shortest path, and eight neighbours let a creature
// take a corner diagonally without cutting through stone.
//
// The search is the caller's grid, not this module's: the scene owns walkability (a door leaf may
// be open, a gateway is never a wall, a chasm is not a floor), and a grid rebuilt whenever the
// player changes cell is cheap (a 100×100 dungeon is 10 000 cells, one array).
//
// Nothing here touches the DOM, the renderer or a monster: it is cells in, directions out, and
// `tests/unit/navflow.test.mjs` holds it against a walled maze.

/** The eight neighbour offsets, in the order `DIRECTIONS` uses them. */
export const NEIGHBOURS_8 = Object.freeze([
  [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],
]);

/** A cell's next step, as `(dRow, dCol)` pairs indexed by the cell number. */
export const NO_STEP = 127;

/**
 * Build the flow toward a goal cell.
 *
 * `walkable(row, col)` is the caller's own test. The goal is allowed to be a cell the test refuses
 * (a player standing on a doorway's threshold is the commonest), because the search starts *from*
 * the goal and asks only whether the **neighbours** can be stood in.
 *
 * A diagonal step is only written when both of its orthogonal halves are open — the same rule a
 * body obeys, so a creature never clips the corner of a wall to reach the player.
 *
 * @param {object} opts
 * @param {(row: number, col: number) => boolean} opts.walkable
 * @param {number} opts.width   cells along the column axis
 * @param {number} opts.depth   cells along the row axis
 * @param {{row: number, col: number}} opts.goal
 * @returns {{width: number, depth: number, dRow: Int8Array, dCol: Int8Array, dist: Int32Array,
 *   reached: number, goalRow: number, goalCol: number}}
 */
export function buildFlow({ walkable, width, depth, goal }) {
  const full = { width, depth, dRow: new Int8Array(0), dCol: new Int8Array(0), dist: new Int32Array(0), reached: 0, goalRow: -1, goalCol: -1 };
  const w = Math.max(0, Math.trunc(width) || 0);
  const d = Math.max(0, Math.trunc(depth) || 0);
  if (!w || !d || typeof walkable !== 'function' || !goal) return full;
  const goalRow = Math.trunc(goal.row);
  const goalCol = Math.trunc(goal.col);
  if (goalRow < 0 || goalCol < 0 || goalRow >= d || goalCol >= w) return full;

  const dRow = new Int8Array(w * d).fill(NO_STEP);
  const dCol = new Int8Array(w * d).fill(NO_STEP);
  const dist = new Int32Array(w * d).fill(-1);
  const queue = new Int32Array(w * d);
  let head = 0;
  let tail = 0;
  const start = goalRow * w + goalCol;
  dist[start] = 0;
  queue[tail++] = start;
  let reached = 1;
  while (head < tail) {
    const cell = queue[head++];
    const row = (cell / w) | 0;
    const col = cell - row * w;
    for (const [dr, dc] of NEIGHBOURS_8) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nc < 0 || nr >= d || nc >= w) continue;
      const next = nr * w + nc;
      if (dist[next] !== -1) continue;
      if (!walkable(nr, nc)) continue;
      // **No corner cutting**: a diagonal is legal only when both of its sides are, which is
      // what keeps a body's shoulders out of the stone it is turning around.
      if (dr && dc && (!walkable(row, nc) || !walkable(nr, col))) continue;
      dist[next] = dist[cell] + 1;
      // The direction from the new cell *toward* the one the search came from.
      dRow[next] = -dr;
      dCol[next] = -dc;
      queue[tail++] = next;
      reached++;
    }
  }
  return { width: w, depth: d, dRow, dCol, dist, reached, goalRow, goalCol };
}

/**
 * The next step from a cell, or null when the cell is unreachable or is the goal itself.
 *
 * @param {object|null} flow  a `buildFlow` result
 * @param {number} row
 * @param {number} col
 * @returns {{dRow: number, dCol: number}|null}
 */
export function stepFrom(flow, row, col) {
  if (!flow || !flow.width || !flow.depth) return null;
  const r = Math.trunc(row);
  const c = Math.trunc(col);
  if (r < 0 || c < 0 || r >= flow.depth || c >= flow.width) return null;
  const i = r * flow.width + c;
  if (flow.dist[i] < 0) return null;
  const dRow = flow.dRow[i];
  const dCol = flow.dCol[i];
  if (dRow === NO_STEP || dCol === NO_STEP) return null;
  return { dRow, dCol };
}

/**
 * **Away from the player**, for a creature that has given the fight up.
 *
 * A flight is the same field read backwards: of the eight neighbours a body could stand in, the
 * one the search found *farthest* from the player is the step that opens the gap, and a creature
 * boxed into a corner keeps the best of a bad set rather than pressing into stone.
 *
 * @param {object|null} flow
 * @param {(row: number, col: number) => boolean} walkable
 * @param {number} row
 * @param {number} col
 * @returns {{dRow: number, dCol: number}|null}
 */
export function retreatFrom(flow, walkable, row, col) {
  if (!flow || !flow.width || !flow.depth) return null;
  const here = Math.trunc(row) * flow.width + Math.trunc(col);
  const own = flow.dist[here] ?? -1;
  let best = null;
  for (const [dr, dc] of NEIGHBOURS_8) {
    const nr = Math.trunc(row) + dr;
    const nc = Math.trunc(col) + dc;
    if (nr < 0 || nc < 0 || nr >= flow.depth || nc >= flow.width) continue;
    if (!walkable(nr, nc)) continue;
    if (dr && dc && (!walkable(row, nc) || !walkable(nr, col))) continue;
    const dist = flow.dist[nr * flow.width + nc];
    // An unreachable neighbour is as far away as anything gets: a flight out of the player's
    // room is a good flight even when the search could not follow it.
    const score = dist < 0 ? Number.MAX_SAFE_INTEGER : dist;
    if (score <= own) continue;
    if (!best || score > best.score) best = { dRow: dr, dCol: dc, score };
  }
  return best ? { dRow: best.dRow, dCol: best.dCol } : null;
}

/**
 * The human word for an `AUTOMAP_DIRECTIONS` key — `southWest` → `south-west` — which is the word
 * `template.dat`'s `%di` wants (*"I would check to the south-west if I were you"*).
 *
 * @param {string} key
 * @returns {string}
 */
export function directionWord(key) {
  const text = String(key ?? 'east')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
  return text || 'east';
}
