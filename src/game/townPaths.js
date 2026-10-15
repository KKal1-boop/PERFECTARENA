// THE TOWN'S WAYS — where a resident is walking, and the shortest way to get there.
//
// Ported from the twin (`daggerfall/src/systems/livingWorld/townPaths.js`, LW1): an A* over a
// town's own grid so a resident walks *to* the place their day sends them — the door of the
// trade they keep, their temple, the tavern, their own home cell — instead of idling in a
// random walk. What the twin searches is Daggerfall's `CityNavigation` grid, whose cells carry
// a **weight** (a road is cheapest, stone dearest) and whose buildings have weight zero; Arena's
// cities have no such grid in the data this project can read, so what is ported is the *search*
// and the book that keeps its answers, with the weights derived from the level the game already
// has:
//
//   * a cell the player can stand on is walkable (weight 4);
//   * a cell a **building** stands on, a chasm, or the level's own outer ring is not (weight 0);
//   * a doorway's own street cell is walkable — people walk past doors, and a shopkeeper has to
//     reach their own;
//   * every walkable cell costs the same. Arena's data does not say which paving is a road, so
//     inventing a cheaper class would be inventing the answer the twin gets from its grid. On a
//     flat grid A* is the shortest walk, which is all the twin's weighting means at its own
//     limits, and this says so rather than pretending to a road bias it does not have.
//
// The search is **reusable and budgeted**, for the reason the twin wrote down: a town's morning
// is a hundred people asking for a path at once, and a search over a 128×128 grid is not free.
// `createPathBook` keeps answers by their two ends (most of a day is the same few dozen walks),
// queues what is new, and runs the queued searches a slice at a time inside a per-frame budget
// of expansions — so a crowd arriving never costs one frame a hundred searches.

/** A step's cost on the walkable grid: every open cell the same (see this file's header). */
export const STEP_COST = 1;

/** How many grid cells one search may open before it gives up and answers "no way". */
export const PATH_MAX_EXPANSIONS = 40000;

/**
 * How many cells a frame's searching may open, and how many new walks a frame may ask for.
 *
 * Both are the twin's own kind of number, and both were measured rather than picked: a search
 * across a 128×128 city opens a few thousand cells (≈1 ms), so a frame that opens 6000 stays
 * inside a 60 fps budget with room for the rest of the scene. A city's first morning asks for
 * maybe forty new walks, so the cap of 64/frame spreads them over a second of play rather than
 * spending one frame on all of them.
 */
export const PATH_CELLS_PER_FRAME = 6000;
export const PATH_ASKS_PER_FRAME = 64;

/**
 * The walkable grid of a level, in the shape the search wants.
 *
 * @param {object} opts
 * @param {{width: number, depth: number, cells: object[]}} opts.level
 * @param {(row: number, col: number) => boolean} [opts.extraOpen]  doorways and the like, which
 *   the level's own cell flags do not tell apart from a wall
 * @returns {{width: number, depth: number, open: (row: number, col: number) => boolean, stamp: object}}
 */
export function townGrid({ level, extraOpen }) {
  const { width, depth, cells } = level;
  /** @returns {number} 4 walkable, 0 not — the twin's weight, read by its own convention. */
  const open = (row, col) => {
    if (row < 1 || col < 1 || row >= depth - 1 || col >= width - 1) return false;
    const cell = cells[row * width + col];
    if (!cell || cell.floor?.chasm) return false;
    // A person walks through a doorway and around a pillar, but not through a wall: a door is
    // `0xB` and solid, which is exactly the cell a shopkeeper has to reach.
    if (cell.kind === 'door') return true;
    if (extraOpen && extraOpen(row, col)) return true;
    return !cell.solid && cell.kind !== 'entity';
  };
  return { width, depth, open, grid: null };
}

/**
 * The cheapest four-neighbour way from one cell to another, or null.
 *
 * A* with the Manhattan distance as its heuristic — exact on a four-neighbour grid, so the
 * answer is a shortest walk. Ties break on the order cells were opened, so the same two ends
 * always give the same walk: a town's people must not take a different route every reload.
 *
 * @param {{width: number, depth: number, open: (row: number, col: number) => boolean}} nav
 * @param {[number, number]} from  `[row, col]`
 * @param {[number, number]} to
 * @param {{maxExpansions?: number, cells?: {value: number}}} [opts]  `cells` is a shared budget
 *   the search spends as it opens cells, so a caller can bound a frame (see `createPathBook`)
 * @returns {number[][]|null|undefined} the cells; null for "no way between them"; **undefined**
 *   when the budget ran out first — a search cut short is not an answer, and a caller that
 *   cached it as "no way" would wall a person in for the rest of the day
 */
export function findTownPath(nav, from, to, opts = {}) {
  const { width, depth } = nav;
  const limit = opts.maxExpansions ?? PATH_MAX_EXPANSIONS;
  const [ar, ac] = from;
  const [br, bc] = to;
  const inside = (row, col) => row >= 0 && col >= 0 && row < depth && col < width;
  if (!inside(ar, ac) || !inside(br, bc)) return null;
  if (!nav.open(ar, ac) || !nav.open(br, bc)) return null;
  if (ar === br && ac === bc) return [[ar, ac]];

  const index = (row, col) => row * width + col;
  const start = index(ar, ac);
  const goal = index(br, bc);
  const g = new Float64Array(width * depth).fill(Infinity);
  const from2 = new Int32Array(width * depth).fill(-1);
  const closed = new Uint8Array(width * depth);
  g[start] = 0;
  // A binary heap of indices, ordered by f: the search's own frontier.
  const heap = [start];
  const f = new Float64Array(width * depth);
  f[start] = Math.abs(ar - br) + Math.abs(ac - bc);
  let expansions = 0;
  const less = (a, b) => f[a] < f[b] || (f[a] === f[b] && a < b);
  const push = (value) => {
    heap.push(value);
    let k = heap.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (!less(heap[k], heap[parent])) break;
      const swap = heap[parent];
      heap[parent] = heap[k];
      heap[k] = swap;
      k = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const left = 2 * k + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        let smallest = left;
        if (right < heap.length && less(heap[right], heap[left])) smallest = right;
        if (!less(heap[smallest], heap[k])) break;
        const swap = heap[k];
        heap[k] = heap[smallest];
        heap[smallest] = swap;
        k = smallest;
      }
    }
    return top;
  };

  while (heap.length) {
    const current = pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === goal) {
      const out = [];
      for (let at = current; at !== -1; at = from2[at]) out.push([Math.floor(at / width), at % width]);
      return out.reverse();
    }
    if (++expansions > limit) return null;
    if (opts.cells) {
      opts.cells.value -= 1;
      if (opts.cells.value <= 0) return undefined;
    }
    const row = Math.floor(current / width);
    const col = current % width;
    const here = g[current];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = row + dr;
      const nc = col + dc;
      if (!inside(nr, nc) || !nav.open(nr, nc)) continue;
      const next = index(nr, nc);
      if (closed[next]) continue;
      const cost = here + STEP_COST;
      if (cost >= g[next]) continue;
      g[next] = cost;
      from2[next] = current;
      f[next] = cost + Math.abs(nr - br) + Math.abs(nc - bc);
      push(next);
    }
  }
  return null;
}

/**
 * A town's **path book**: walks asked once, kept by their two ends, searched on a budget.
 *
 * The twin's own shape (`createPathBook`), with its two measurements kept as this port's
 * constants: `cells(n)` per frame, so the searching a frame does is bounded, and `budget(n)`
 * new walks a frame may ask for, so a crowd arriving does not ask for forty searches in one
 * frame. `get` answers a walk already known; `want` asks for one and answers it once searched,
 * `undefined` while it is still waiting; `run()` spends the frame's cells on what is waiting.
 *
 * @param {{width: number, depth: number, open: (row: number, col: number) => boolean}} nav
 * @param {{max?: number}} [opts]
 */
export function createPathBook(nav, { max = 512 } = {}) {
  const keyOf = (a, b) => ((a[0] * 4096 + a[1]) * 16777216 + (b[0] * 4096 + b[1]));
  /** @type {Map<number, number[][]|null>} */
  const book = new Map();
  /** @type {Map<number, [number[], number[]]>} */
  const waiting = new Map();
  let askBudget = PATH_ASKS_PER_FRAME;
  let cellBudget = PATH_CELLS_PER_FRAME;
  let spent = 0;
  let asked = 0;

  function search(key, ends) {
    const budget = { value: cellBudget };
    const found = findTownPath(nav, ends[0], ends[1], { cells: budget });
    spent += cellBudget - budget.value;
    cellBudget = budget.value;
    // Only a *finished* search is kept: a search the frame's budget cut short goes back on the
    // queue and is asked for again next frame, which is what keeps a crowd's arrival from
    // turning into hands of "this whole town is walled off".
    if (found === undefined) return undefined;
    book.set(key, found);
    if (book.size > max) book.delete(book.keys().next().value);
    return found;
  }

  return {
    /** A walk already known, or null; `undefined` when nobody has asked for it yet. */
    get(a, b) {
      const key = keyOf(a, b);
      return book.has(key) ? book.get(key) : undefined;
    },
    /**
     * The walk from `a` to `b`: its cells, null for "no way", `undefined` while it waits.
     * @param {number[]} a @param {number[]} b
     */
    want(a, b) {
      const key = keyOf(a, b);
      if (book.has(key)) return book.get(key);
      if (!waiting.has(key) && asked < askBudget) {
        waiting.set(key, [a, b]);
        asked++;
      }
      return undefined;
    },
    /** A new frame: the cells its searching may open, and the walks it may ask for. */
    frame(cells = PATH_CELLS_PER_FRAME, asks = PATH_ASKS_PER_FRAME) {
      cellBudget = cells;
      askBudget = asks;
      spent = 0;
      asked = 0;
    },
    /** Search what is waiting, inside this frame's cells. @returns {number} walks finished */
    run() {
      let done = 0;
      for (const [key, ends] of [...waiting]) {
        if (cellBudget <= 0) break;
        waiting.delete(key);
        const found = search(key, ends);
        if (found === undefined) {
          // Out of budget: the walk waits for the next frame, and the asking does not count
          // against the frame's allowance twice (it is already in the book's queue).
          waiting.set(key, ends);
          break;
        }
        done++;
      }
      return done;
    },
    spent: () => spent,
    waiting: () => waiting.size,
    size: () => book.size,
    /** Forget everything — a new level has a new grid. */
    clear() {
      book.clear();
      waiting.clear();
    },
  };
}

/**
 * The line a person walks: the cell centres of a path, with the turns kept.
 *
 * Kept because a person's walk is animated along a *line* rather than snapped cell to cell:
 * `pathLine`'s own shape (metres, both ends kept) is what `pointOnLine` reads.
 *
 * @param {number[][]} cells
 * @param {number} cellSize
 * @returns {{pts: number[][], len: number, cum: number[]}}
 */
export function pathLine(cells, cellSize = 2.5) {
  const pts = [];
  for (let i = 0; i < cells.length; i++) {
    // A point is [x, z] in the level's own convention: x runs along the row, z along the column
    // (`cellAtWorld` and `teleportCell` both read it so). This used to be transposed, so a route
    // ran along the other axis from the grid it was planned on.
    if (i === 0 || i === cells.length - 1) { pts.push([(cells[i][0] + 0.5) * cellSize, (cells[i][1] + 0.5) * cellSize]); continue; }
    const previous = cells[i - 1];
    const here = cells[i];
    const next = cells[i + 1];
    if ((here[0] - previous[0]) !== (next[0] - here[0]) || (here[1] - previous[1]) !== (next[1] - here[1])) {
      pts.push([(here[0] + 0.5) * cellSize, (here[1] + 0.5) * cellSize]);
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { pts, len: cum[cum.length - 1] ?? 0, cum };
}

/**
 * The point `s` metres along a walked line, and the way it faces there.
 * @param {{pts: number[][], len: number, cum: number[]}} line
 * @param {number} s
 * @returns {{x: number, z: number, yaw: number}} `yaw` as the scene's own convention reads it
 */
export function pointOnLine(line, s) {
  const { pts, cum } = line;
  if (!pts.length) return { x: 0, z: 0, yaw: 0 };
  if (pts.length === 1) return { x: pts[0][0], z: pts[0][1], yaw: 0 };
  const d = Math.max(0, Math.min(line.len, s));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const segment = cum[i] - cum[i - 1];
  const t = segment > 0 ? (d - cum[i - 1]) / segment : 0;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
