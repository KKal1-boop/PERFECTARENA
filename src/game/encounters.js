// WHO IS IN THE ROOM.
//
// Arena populates a dungeon from tables it keeps in `A.EXE` — which this data set does
// not ship (D11) — so *which* creatures stand where is this project's rule, while the
// creatures themselves, their statistics and their sprites are all Arena's
// (`game/monsters.js`). The two halves are kept apart on purpose: `rosterFor` says what a
// danger rating can put in front of you, and this module only decides *where* they stand.
//
// Two rules make a spawn usable rather than merely present:
//
//   * **standable cells only** — the same test the player's own spawn point uses
//     (`mifLevel.js`'s `usable`): not solid, not a chasm. A rat standing inside a wall is
//     worse than no rat at all.
//   * **never next to the player** — every monster is at least `minCells` away from the
//     arrival point, so walking into a room is not the same as walking into a bite. A
//     level too small for that keeps its spawns, because refusing to populate a corridor
//     would be the worse failure.
//
// A spawn is a pure function of `(level, seed)`, like everything else in `game/`: reload
// the same dungeon and the same creatures are in the same places.

import { ArenaRandom } from './arenaRandom.js';
import { rollMonster } from './combat.js';
import { MONSTERS, monsterById, rosterFor } from './monsters.js';

/**
 * @typedef {object} SpawnedMonster
 * @property {object} monster    a rolled monster (`game/combat.js`)
 * @property {{row: number, col: number, x: number, y: number, z: number}} place
 * @property {number} distance   in cells from the arrival point
 */

/**
 * Populate a level.
 *
 * @param {object} opts
 * @param {import('./mifLevel.js').ArenaLevel} opts.level
 * @param {number} [opts.seed]      the level's own seed, so a reload is the same fight
 * @param {number} [opts.danger]    the danger rating the roster is drawn from
 * @param {number} [opts.count]     how many monsters to place
 * @param {{row: number, col: number}} [opts.arrival]
 * @param {number} [opts.minCells]  the closest a monster may stand to the arrival
 * @param {string[]} [opts.monsters]  **the level's own roster** — the monster ids its
 *   `.INF` names in its `@FLATS` `*ITEM` lines (`dungeonItems.monsterRosterFromInf`). A
 *   dungeon is *about* its creatures: `halls1.inf` names the rat through the lich, a
 *   tavern's inf names none, and the danger-rated pool below is only the fallback for a
 *   level that names nothing at all.
 * @returns {SpawnedMonster[]}
 */
export function spawnEncounter(opts) {
  const level = opts.level;
  const random = new ArenaRandom((opts.seed ?? 1) >>> 0);
  const danger = opts.danger ?? 1;
  // The level's own roster when it has one. Until this the parameter existed and was never
  // passed, so *every* dungeon in the game drew from the danger pool instead of its own
  // bestiary — the reported "most monsters dont spawn but skeletons and spiders": the pool's
  // low tiers are drawn first and the same few creatures stood in every dungeon on the map,
  // whatever its own `.INF` said lived there.
  const named = (opts.monsters ?? [])
    .map((id) => monsterById(String(id)))
    .filter(Boolean);
  const roster = named.length ? named : rosterFor(danger);
  if (!roster.length || !level?.cells?.length) return [];
  const arrival = opts.arrival ?? null;
  const minCells = opts.minCells ?? 6;
  const excluded = opts.exclude ?? new Set();
  // Stay in the arrival's connected region. A standable cell in a sealed room is
  // not a usable encounter, especially when a bounty requires every target to die.
  let reachable = null;
  if (arrival) {
    reachable = new Set();
    const row = Math.floor(arrival.row), col = Math.floor(arrival.col);
    const queue = [row * level.width + col];
    reachable.add(queue[0]);
    for (let head = 0; head < queue.length; head++) {
      const r = Math.floor(queue[head] / level.width), c = queue[head] % level.width;
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nr = r + dr, nc = c + dc, index = nr * level.width + nc;
        if (nr < 0 || nc < 0 || nr >= level.depth || nc >= level.width || reachable.has(index)) continue;
        const cell = level.cells[index];
        if (!cell || cell.floor?.chasm || (cell.solid && cell.kind !== 'door')) continue;
        reachable.add(index); queue.push(index);
      }
    }
  }

  const usable = (row, col) => {
    if (row < 1 || col < 1 || row >= level.depth - 1 || col >= level.width - 1) return false;
    const index = row * level.width + col;
    const cell = level.cells[index];
    if (!cell || cell.solid || cell.floor?.chasm || excluded.has(`${row},${col}`)) return false;
    if (reachable && !reachable.has(index)) return false;
    // A cell with no floor texture is outside the map's drawn part; a monster there
    // would stand in the void.
    return cell.floor?.texture >= 0;
  };

  /** Every standable cell, with its distance from the arrival. */
  const standable = [];
  for (let row = 1; row < level.depth - 1; row++) {
    for (let col = 1; col < level.width - 1; col++) {
      if (!usable(row, col)) continue;
      const distance = arrival
        ? Math.hypot(row - arrival.row, col - arrival.col)
        : Infinity;
      standable.push({ row, col, distance });
    }
  }
  if (!standable.length) return [];

  const far = standable.filter((c) => c.distance >= minCells);
  const pool = far.length ? far : standable;

  const wanted = Math.max(0, Math.min(opts.count ?? 3, pool.length));
  const spawned = [];
  // Draw without replacement, so two monsters never stand in the same cell.
  const cells = pool.slice();
  for (let i = 0; i < wanted; i++) {
    const pick = random.nextBelow(cells.length);
    const [place] = cells.splice(pick, 1);
    // The kind is drawn from the whole roster, not from its first tier: a level that names
    // thirteen creatures should field thirteen, and a lich is not rarer than a rat here —
    // the *danger* is what scales the bodies' statistics (below), which is the original's
    // own division of labour between a level's bestiary and its difficulty.
    const kind = roster[random.nextBelow(roster.length)];
    const monster = rollMonster(kind, random, { level: Math.max(1, danger + random.nextBelow(3) - 1) });
    spawned.push({
      monster,
      place: {
        row: place.row,
        col: place.col,
        x: (place.row + 0.5) * (level.cellSize ?? 1),
        y: level.floorY ?? 1,
        z: (place.col + 0.5) * (level.cellSize ?? 1),
      },
      distance: place.distance,
    });
  }
  return spawned;
}

/**
 * The danger rating of a place, from what is known about it.
 *
 * There is no published table for this either. The rule used here is deliberately plain
 * and stated: a quest dungeon's own stage number drives it (the eighth piece is a far
 * worse place than the first), a city is safe, and a plain interior sits in between.
 *
 * @param {object} opts
 * @param {number} [opts.stage]   the main quest's stage, 0…9
 * @param {boolean} [opts.city]
 * @returns {number} 1…40
 */
export function dangerOf(opts = {}) {
  if (opts.city) return 1;
  if (Number.isFinite(opts.stage)) return 2 + Math.max(0, Math.min(8, opts.stage)) * 3;
  return 4;
}

/**
 * How many creatures a level of this danger and size holds.
 *
 * Arena's dungeons are populated places, not four-monster rooms, and the count here scales
 * with the quest's own stage the way `dangerOf` does — a corridor on the first stage holds
 * six and the palace's depths hold fourteen. `spawnEncounter` clamps it to the number of
 * standable cells it has, so a corridor keeps what fits.
 *
 * @param {object} opts
 * @param {number} [opts.danger]
 * @param {{width: number, depth: number}} [opts.level]
 * @param {string[]} [opts.monsters]  the level's own roster, as `spawnEncounter` takes it
 * @returns {number}
 */
export function monsterCountFor(opts = {}) {
  const danger = opts.danger ?? 4;
  const size = (opts.level?.width ?? 0) * (opts.level?.depth ?? 0);
  // A level that names no monster of its own gets none: `start.inf` — the Imperial
  // Dungeons — lists keys, equipment and treasure and not one creature, which is exactly
  // why the escape is quiet, and it must stay that way (measured in `dungeonItems`'s own
  // header). A level that names some keeps its own breed and gets a count by danger.
  if (opts.monsters && !opts.monsters.length) return 0;
  if (size && size < 400) return 2;                       // a shop, a cellar, a single room
  return Math.max(4, Math.min(14, 6 + Math.floor(Math.max(0, danger - 2) / 3)));
}

/** How many species this install has, for the tests and the HUD. */
export const MONSTER_SPECIES = MONSTERS.length;
