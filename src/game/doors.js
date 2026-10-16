// DUNGEON DOORS — WHETHER ONE IS LOCKED, HOW IT OPENS, AND WHERE IT SWINGS TO.
//
// A `0xB` voxel is a **door**: `mifMesh.js` gives each one its own thin panel bundle and
// its own slice of the collider, and this module is the law of the rest of it —
//
//   * **which doors are locked**, from the level's own `LOCK` chunk,
//   * **how the panel moves** when it opens (`doorMatrix`), and
//   * **what it takes to get through** one that is locked (`forceChance`, `keyOpens`).
//
// ## Locked doors are the map's own list
//
// Every `.MIF` level carries a `LOCK` chunk: three bytes per entry — `x`, `y`, and a lock
// level. In every shipped dungeon the pair is the door's **column and row** (measured: of
// `39300577.MIF`'s 16 locks, 15 land exactly on a door cell with `x` as the column and one
// does not land on a door at all; `START.MIF`'s single lock — the cell door of the
// Imperial Dungeons' first room — is exact). The one non-door entry is kept out of the
// table by the caller: a lock only means something on a door.
//
// Lock levels run **1…10** for the ordinary locks. The bigger numbers — `62`, `65`, `68`,
// `70`, `71`, `90` in `39300577.MIF`, `20`, `22`, `26`, `34` in the palace's bottom level
// — are the original saying "this is not a lock you pick": its own sealed door, the one
// the quest's own key is for (`ArenaVoxelUtils` treats a level above the pick limit as
// magically held). So a lock above `HAND_FORCE_MAX` is refused by hand and says what it
// needs, and the palace's Jewel-of-Fire cell — the one the mithril key opens — is that
// rule applied to the quest (`scenes/interior.js`'s objectives).
//
// ## The swing
//
// The panel spans one of the cell's two axes (`built.doors[].panel`), and a swinging door
// turns about a vertical line through one end of that span, by `SWING_DEGREES` — enough to
// clear the doorway and come to rest *just short of* the wall the map put beside it, which is
// what `leafIntoSolid` below is the law of (the leaf turned 96° once, and clipped into it).
// Sliding doors travel
// along the panel's own axis (into the wall) and raising ones lift a whole cell; Arena's
// fourth kind, `splitting`, is drawn as a slide, because a two-leaf split needs geometry
// the cell does not carry (the panel is one picture, not two).
//
// ## What is reconstructed
//
// `A.EXE` holds Arena's own lockpicking rules (the thieving skill, the lockpick item and
// the exact odds), so the *chance* below is this project's and says so: a strong arm can
// force an ordinary lock, and it gets harder as the lock's own level rises. Everything
// else here is the data's.

import { multiply, trs } from '../engine/world/mat4.js';

/** How long a door takes to open, in seconds (the scene's clock). */
export const DOOR_OPEN_SECONDS = 0.55;
/** How long it takes to close again. */
export const DOOR_CLOSE_SECONDS = 0.35;
/**
 * How far a swinging panel turns.
 *
 * **Short of the jamb, by the original's own margin.** The panel spans a whole cell and is
 * hinged at one end of that span, so at exactly 90° it comes to rest *in the plane of the wall
 * beside it*; past 90° it goes through that wall. This port turned **96°**, which drove the
 * far end of every swinging door 0.10 of a cell (26 cm) into the neighbouring cell — and that
 * neighbour is solid by construction, because `mifMesh` gives a door `panel: 'x'` only when the
 * two cells it does *not* swing into are walls — which is the owner's report, "when doors open
 * they clip into the wall instead in normal arena they dont". Arena's own answer, read out of
 * OpenTESArena (`Voxels/VoxelDoorUtils.cpp`, `getSwingingRotationRadians`):
 *
 *     constexpr Radians maxSwingRadians = Constants::HalfPi - bigEpsilon;   // bigEpsilon 0.005
 *
 * with the comment "Prevents Z-fighting with 32-bit depth" — i.e. the leaf stops a hair short
 * of the wall rather than lying in its plane. 89.71° is that number, and the law it serves is
 * `leafIntoSolid` below: **no part of a swinging leaf is ever inside a solid cell.**
 */
export const SWING_DEGREES = 90 - 0.005 * (180 / Math.PI);
/** The highest lock level an unaided arm can still force. */
export const HAND_FORCE_MAX = 10;

/**
 * The lock level from which a door **must** have a key somewhere in the level.
 *
 * `forceChance` gives a level-4 lock 0.65 and a level-10 one about 0.20, so from four upward a
 * shove is a gamble rather than a method; every lock at or above it gets a key placed on the
 * player's side of the door (`placeKeys`). Below it, the arm is the way through and a key would
 * be litter.
 */
export const KEYWORTHY_LOCK = 4;

/** A door's own axis, for a matrix's rotation. */
const Y_AXIS = 'y';

/**
 * The level's `LOCK` chunk as a table of `"row,col"` → lock level.
 *
 * @param {import('../arena/mifFile.js').MifLevel|null|undefined} mifLevel
 * @returns {Map<string, number>}
 */
export function lockTable(mifLevel) {
  const locks = new Map();
  for (const entry of mifLevel?.lock ?? []) {
    if (!Number.isFinite(entry?.x) || !Number.isFinite(entry?.y)) continue;
    const key = `${entry.y},${entry.x}`;
    const level = entry.lockLevel ?? 0;
    const held = locks.get(key);
    if (held === undefined || level > held) locks.set(key, level);
  }
  return locks;
}

/**
 * The lock level of one cell, or 0 for an unlocked door.
 * @param {Map<string, number>} locks @param {number} row @param {number} col
 * @returns {number}
 */
export function lockAt(locks, row, col) {
  return locks.get(`${row},${col}`) ?? 0;
}

/**
 * The hinge a door turns about, in world units.
 *
 * A panel that spans **x** (its plane is `z = the cell's middle`) is hinged at the low-z
 * end of its own span, so it turns about the vertical line at `x = the cell's low edge`,
 * `z = the cell's middle`; a panel that spans **z** is the mirror of that. Both turn the
 * same way relative to their own cell, which is what makes two doors in one corridor open
 * consistently rather than each at whim.
 *
 * @param {{row: number, col: number, panel: 'x'|'z'}} door
 * @param {number} cellSize
 * @returns {{pivot: number[], axis: string, panel: 'x'|'z'}}
 */
export function hingeFor(door, cellSize) {
  const S = cellSize;
  const x0 = door.row * S;
  const z0 = door.col * S;
  if (door.panel === 'z') {
    // The panel spans z, on the plane x = the cell's middle; hinged at its low-z end.
    return { pivot: [x0 + S / 2, 0, z0], axis: Y_AXIS, panel: 'z' };
  }
  return { pivot: [x0, 0, z0 + S / 2], axis: Y_AXIS, panel: 'x' };
}

/**
 * The model matrix of a door at `open` (0 shut, 1 fully open).
 *
 * A swinging panel rotates about its hinge; a sliding one travels one cell along the axis
 * its panel spans (into the wall it is set in) and a raising one lifts a whole cell. The
 * four kinds are Arena's own (`DOOR_KINDS` in `mifLevel.js`).
 *
 * @param {{row: number, col: number, panel: 'x'|'z', kind: string}} door
 * @param {number} cellSize
 * @param {number} open  progress, 0…1 (clamped)
 * @returns {Float32Array} a 4×4 matrix
 */
export function doorMatrix(door, cellSize, open, { swingDegrees = SWING_DEGREES } = {}) {
  const t = Math.max(0, Math.min(1, open));
  const S = cellSize;
  if (door.kind === 'sliding' || door.kind === 'splitting') {
    // A slide goes one whole cell along the panel's own axis: into the wall beside the
    // doorway, which is where the map's own structure leaves room for it.
    const along = door.panel === 'x' ? 1 : 0;
    return trs(along ? S * t : 0, 0, along ? 0 : S * t, 0, 0, 0);
  }
  if (door.kind === 'raising') return trs(0, S * t, 0, 0, 0, 0);
  const { pivot } = hingeFor(door, cellSize);
  const degrees = (door.panel === 'x' ? -1 : 1) * swingDegrees * t;
  const turn = trs(0, 0, 0, 0, degrees, 0);
  const intoPivot = trs(pivot[0], pivot[1], pivot[2], 0, 0, 0);
  const outOfPivot = trs(-pivot[0], -pivot[1], -pivot[2], 0, 0, 0);
  return multiply(multiply(intoPivot, turn), outOfPivot);
}

/**
 * Where a door's leaf stands at `open`, as the **two ends of its own panel** in plan (x, z).
 *
 * The closed panel's ends are the ones `mifMesh` emits (`panel: 'x'` spans x at the cell's
 * middle z; `panel: 'z'` is the mirror), and `doorMatrix` carries them wherever the swing,
 * slide or lift takes them — so this is the same geometry the scene draws, asked as two points.
 * The law below is what keeps the drawn leaf out of the wall.
 *
 * @param {{row: number, col: number, panel: 'x'|'z', kind?: string}} door
 * @param {number} cellSize
 * @param {number} open
 * @returns {{x: number, z: number}[]} the hinge end first, the free end second
 */
export function doorLeaf(door, cellSize, open) {
  const S = cellSize;
  const x0 = door.row * S;
  const z0 = door.col * S;
  const ends = door.panel === 'z'
    ? [{ x: x0 + S / 2, z: z0 }, { x: x0 + S / 2, z: z0 + S }]
    : [{ x: x0, z: z0 + S / 2 }, { x: x0 + S, z: z0 + S / 2 }];
  const m = doorMatrix(door, cellSize, open);
  return ends.map((p) => ({ x: m[0] * p.x + m[8] * p.z + m[12], z: m[2] * p.x + m[10] * p.z + m[14] }));
}

/**
 * The law of the swing: **a swinging leaf never enters a solid cell.**
 *
 * Samples the leaf across its own length (never its two ends: those sit exactly on the jamb and
 * on the wall plane at rest, where "which cell is this" has no answer) and reports the first
 * point that lands in a cell the level calls solid. Sliding and raising doors are exempt on
 * purpose — their whole point is to travel *into* the wall the map leaves hollow for them — so
 * a caller asks this about a `swinging` leaf, which is where the owner saw the clipping.
 *
 * @param {{row: number, col: number, panel: 'x'|'z', kind?: string}} door
 * @param {number} cellSize
 * @param {number} open
 * @param {(row: number, col: number) => boolean} isSolid  the level's own answer for a cell
 * @returns {{open: number, at: {x: number, z: number}, row: number, col: number}|null}
 */
export function leafIntoSolid(door, cellSize, open, isSolid) {
  if (door.kind && door.kind !== 'swinging') return null;
  const [hinge, tip] = doorLeaf(door, cellSize, open);
  for (let i = 1; i < 22; i++) {
    const t = i / 22;
    const x = hinge.x + (tip.x - hinge.x) * t;
    const z = hinge.z + (tip.z - hinge.z) * t;
    const row = Math.floor(x / cellSize);
    const col = Math.floor(z / cellSize);
    if (isSolid(row, col)) return { open, at: { x, z }, row, col };
  }
  return null;
}

/**
 * The lock level a player's own keys open, from what they are carrying.
 *
 * @param {{lock: number}[]|null|undefined} keys
 * @param {number} lockLevel
 * @returns {{lock: number}|null} the key that does it, or null
 */
export function keyOpens(keys, lockLevel) {
  if (!lockLevel) return null;
  let best = null;
  for (const key of keys ?? []) {
    if ((key?.lock ?? 0) >= lockLevel && (!best || key.lock < best.lock)) best = key;
  }
  return best;
}

/**
 * The chance an unarmed attempt springs a lock — **reconstructed** (see the header).
 *
 * A strong character can force an ordinary lock; the chance falls as the lock's own level
 * rises and is zero for a sealed one (`lockLevel > HAND_FORCE_MAX`), which needs a key.
 *
 * @param {number} strength  the character's Strength attribute
 * @param {number} lockLevel
 * @returns {number} 0…1
 */
export function forceChance(strength, lockLevel) {
  if (lockLevel <= 0) return 1;
  if (lockLevel > HAND_FORCE_MAX) return 0;
  const base = 0.95 - 0.075 * lockLevel + (Number.isFinite(strength) ? strength : 0) / 400;
  return Math.max(0.05, Math.min(0.95, base));
}

/**
 * The cells a player can reach from the arrival point **without passing a sealed door**.
 *
 * A sealed door (`lockLevel > HAND_FORCE_MAX`) is the one thing that can lock a player out
 * of part of a level, which is exactly why a key for it has to be placed on the near side.
 * A door they can force comes and goes and does not close a region off.
 *
 * @param {{level: object, doors: object[], spawn: {row: number, col: number}|null}} opts
 * @returns {Set<number>} reachable cell indices (`row * width + col`)
 */
export function reachableCells({ level, doors = [], spawn = null }) {
  const seen = new Set();
  const width = level?.width ?? 0;
  const depth = level?.depth ?? 0;
  if (!width || !depth) return seen;
  // Plan keys without assuming the player can force a locked door first.
  const sealed = new Set(doors.filter((d) => d.lockLevel > 0 && d.locked !== false).map((d) => `${d.row},${d.col}`));
  // **`x` is the row and `z` the column** in the scene's own spawn record — the very convention
  // its `stepTownsfolk` places people with (`x: (row + 0.5) * CELL_SIZE`, `z: (col + 0.5) * …`)
  // and its own arrival uses (`row: spawn.x - 0.5, col: spawn.z - 0.5`). This read the pair the
  // other way round, so the walk of the reachable area started from the *transposed* cell: in the
  // Imperial Dungeons (start row 26, column 1) it began at row 1, column 26 — a different room,
  // and the place keys are found from was therefore wrong. A dungeon key could be put behind the
  // door it opens, or, in that first room, nowhere at all.
  const start = spawn ? { row: Math.round(spawn.x - 0.5), col: Math.round(spawn.z - 0.5) } : { row: 1, col: 1 };
  const queue = [Math.max(1, Math.min(depth - 2, start.row)) * width + Math.max(1, Math.min(width - 2, start.col))];
  seen.add(queue[0]);
  while (queue.length) {
    const index = queue.pop();
    const row = Math.floor(index / width);
    const col = index % width;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= depth || c >= width) continue;
      const next = r * width + c;
      if (seen.has(next)) continue;
      if (sealed.has(`${r},${c}`)) continue;
      const cell = level.cells[next];
      if (!cell || cell.floor?.chasm) continue;
      // A door is passable when it is not sealed (it opens, or it can be forced);
      // anything else solid is a wall.
      if (cell.solid && cell.kind !== 'door') continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * Where the keys for a level's sealed doors lie.
 *
 * One key per *lock level* that is sealed, on the player's own side of it (a flood fill
 * that refuses to pass a sealed door), as far from the arrival point as the reachable area
 * allows — a dungeon key being deep in the level. A level with no sealed door places none,
 * which is most of them.
 *
 * @param {{level: object, doors: object[], spawn: {row: number, col: number}|null}} opts
 * @returns {{row: number, col: number, lock: number, art: string}[]}
 */
export function placeKeys({ level, doors, spawn }) {
  // **Every lock worth a key, not only the unforceable ones.** `sealed` used to mean "above
  // `HAND_FORCE_MAX`", and the consequence was a game with locked doors that had no key
  // anywhere in the level: the Imperial Dungeons' own cell door (lock level 10, a 25 % shove)
  // could only ever be forced, re-rolled, forced again — the reported "there isn't even a key
  // to open the door in front of you". A lock of `KEYWORTHY_LOCK` or more gets one, on the
  // player's own side of it and as deep in the level as the reachable area allows, so forcing
  // is the quick way through and the key is the certain one.
  const sealed = [...new Set((doors ?? []).filter((d) => d.lockLevel >= KEYWORTHY_LOCK).map((d) => d.lockLevel))].sort((a, b) => a - b);
  if (!sealed.length) return [];
  const reach = reachableCells({ level, doors, spawn });
  const start = spawn ? { row: Math.round(spawn.x - 0.5), col: Math.round(spawn.z - 0.5) } : { row: 1, col: 1 };
  const doorCells = new Set((doors ?? []).map((d) => `${d.row},${d.col}`));
  const candidates = [];
  for (const index of reach) {
    const row = Math.floor(index / level.width);
    const col = index % level.width;
    const cell = level.cells[index];
    if (cell?.solid) continue;
    if (doorCells.has(`${row},${col}`)) continue;
    if (row === start.row && col === start.col) continue;
    const distance = Math.hypot(row - start.row, col - start.col);
    // **A key is on the player's side, and as deep as that side allows.** This used to refuse
    // any cell closer than six, which was fine for a dungeon and fatal for a *room*: the Imperial
    // Dungeons begin in the first room (a pocket of fourteen cells) whose only way out is its own
    // locked cell door — the level reported "1 locked, 0 keys placed", and a player who could not
    // force the lock (a one-in-four shove) had nothing to find. The far end of what is reachable
    // is the rule; on a level where that is one room, the key lies in the room.
    if (distance < 1) continue;
    candidates.push({ row, col, distance });
  }
  // The deepest first, and if the reachable area is *only* the cell the player stands on, that
  // cell is the answer: a door with a lock worth a key never has its key out of the level.
  if (!candidates.length && !doorCells.has(`${start.row},${start.col}`)) {
    candidates.push({ row: start.row, col: start.col, distance: 0 });
  }
  candidates.sort((a, b) => b.distance - a.distance || a.row - b.row || a.col - b.col);
  /** @type {{row:number,col:number,lock:number,art:string}[]} */
  const keys = [];
  const taken = new Set();
  for (const lock of sealed) {
    const spot = candidates.find((c) => !taken.has(`${c.row},${c.col}`));
    if (!spot) break;
    taken.add(`${spot.row},${spot.col}`);
    keys.push({ row: spot.row, col: spot.col, lock, art: 'KEY.IMG' });
  }
  return keys;
}

/**
 * What the HUD says about a door the player is standing in.
 *
 * @param {{locked: boolean, lockLevel: number, open: boolean, kind: string}} door
 * @returns {string}
 */
export function doorLine(door) {
  if (door.open) return `A ${door.kind} door stands open — press E to shut it.`;
  if (!door.locked) return `A ${door.kind} door — press E to open it.`;
  if (door.lockLevel > HAND_FORCE_MAX) return `A sealed door, held by a lock of level ${door.lockLevel} — it wants a key.`;
  // A forceable lock **says that a key exists**, because one does (`placeKeys`, `KEYWORTHY_LOCK`):
  // a player who is told only to shove has no way to know the level holds the sure way through.
  if (door.lockLevel >= KEYWORTHY_LOCK) return `A door with a lock of level ${door.lockLevel} — press E to force it, or find the key.`;
  return `A door with a lock of level ${door.lockLevel} — press E to force it.`;
}

/** What a successful forcing (or a key) is reported as. */
export function openReason(used) {
  if (used === 'key') return 'The key turns and the lock gives.';
  if (used === 'forced') return 'The lock gives with a shove.';
  return null;
}

/** What a refused forcing is reported as. */
export const FORCE_FAILED = 'The lock holds — try again, or find the key.';
/** What a sealed door says when nothing in hand opens it. */
export const NEEDS_KEY = 'Sealed. This one wants a key, not an arm.';
