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
 * How much of a level's own bestiary is in play, from the danger of the place and how deep
 * into it the player is.
 *
 * **The order is Arena's; the window is this project's own.** A level's `.INF` names its
 * creatures in `*ITEM` order, and that order is the install's own danger scale — item 32 is a
 * rat and item 54 is a lich (`game/dungeonItems.js`'s `MONSTER_ITEM_MIN`…`MONSTER_ITEM_MAX`),
 * which is why `monsterRosterFromInf` hands them back in it. Which **slice** of that list a
 * given room fields is a rule this project wrote, because the table that decided it is in
 * `A.EXE` (D11, P2). The rule: the top of a stage-1 dungeon fields the weakest 40 % of its
 * own list, a late-stage dungeon's depths field all of it.
 *
 * It replaces a **uniform draw over the whole list**, which stood a stone golem, a firedaemon
 * and a vampire in the first rooms of the Imperial Dungeons beside a goblin — the owner's own
 * report (2026-10-16): "as first enemies you fight a lot of goblins rats … instead in
 * perfectarena theres a golem then a vampire and ghouls" (D-15).
 *
 * @param {string[]} roster  the level's own creature list, in its `.INF` order
 * @param {{danger?: number, depth?: number}} [opts]  `depth` is the level's index inside the
 *   place (0 is where the player arrives); a place one level deep passes 0
 * @returns {string[]} a prefix of `roster` — never empty when the roster is not
 */
export function rosterWindow(roster, opts = {}) {
  const list = Array.isArray(roster) ? roster : [];
  // A single named creature is a *quest target*, not a bestiary: `slay` jobs pass exactly the
  // one kind they want (`interior.js`), and a window must never eat it.
  if (list.length <= 1) return list.slice();
  const danger = Number.isFinite(Number(opts.danger)) ? Number(opts.danger) : 4;
  const depth = Math.max(0, Math.trunc(Number(opts.depth) || 0));
  const share = Math.max(0.3, Math.min(1, 0.3 + (danger - 2) / 30 + depth * 0.12));
  return list.slice(0, Math.max(1, Math.round(list.length * share)));
}

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
 * @param {number} [opts.depth]  the level's index inside the place, 0 for the level the
 *   player arrives on (it is what widens `rosterWindow` as the player descends)
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
  const bestiary = named.length ? named : rosterFor(danger);
  if (!bestiary.length || !level?.cells?.length) return [];
  // **A level's own list is deeper than it is wide.** See `rosterWindow`: the weakest kinds of
  // the level's own roster are what its first rooms hold, and its whole list is what its depths
  // hold. `rosterFor`'s danger pool is already ordered weakest-first for the same reason.
  const roster = rosterWindow(bestiary, { danger, depth: opts.depth ?? 0 });
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
    // The kind is drawn from the **reachable window** of the level's own list (`rosterWindow`),
    // uniformly inside it: a level whose window holds six kinds fields those six, and depth and
    // danger are what widen the window. The *statistics* still scale with the danger rating
    // below, which is the original's own division of labour between a level's bestiary and its
    // difficulty.
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
  // A level that names no monster of its own gets none. **The sentence that used to stand
  // here justified that law wrongly**, and the 2026-10-15 audit caught it (D-02b): it said
  // `start.inf` "lists keys, equipment and treasure and not one creature". Measured with
  // `monsterRosterFromInf`, `start.inf` names **23 species** — itemIndexes 1…8 and 32…54, rat
  // through lich — and the Imperial Dungeons field five of them. The law keeps its own
  // footing (a level that names nothing gets nothing); the false justification is gone.
  //
  // **What it costs today is the whole country.** `TWN.INF`, `DWN.INF` and `MWN.INF` place
  // three item flats and no creature (`itemIndexes [15, 2, 14]`, none in the monster range), so
  // a wilderness window gets `[]` here and zero creatures — `docs/AUDIT-2026-10-15.md` §S-B.
  // The per-terrain, per-hour bestiary that fills it is P1's, and until ACD.EXE is unpacked
  // (P2) it is **this project's own** table, stamped as such. A level that names some keeps its
  // own breed and gets a count by danger.
  if (opts.monsters && !opts.monsters.length) return 0;
  if (size && size < 400) return 2;                       // a shop, a cellar, a single room
  return Math.max(4, Math.min(14, 6 + Math.floor(Math.max(0, danger - 2) / 3)));
}

// ── RESTING IN A DUNGEON ROUSES THE LEVEL (2026-10-16) ─────────────────────────
//
// The owner, playing both games side by side: *"resting spawns enemies or moves enemies to
// you in normal arena and perfectarena doesnt"*. In Arena a dungeon is not a hotel: you camp,
// and the noise of a living body in a quiet corridor carries — the creatures that were
// standing somewhere in the level walk to you, and what wakes you is a blade, not a night's
// sleep.
//
// This port had the camp (`interior.js`'s `rest`), the healing and the passing day, and a
// level whose creatures only ever noticed a player who walked into their band (`AGGRO`, 34
// world units). A creature on the far side of the level never moved for a sleeping player, so
// resting was strictly free. What is *not* reconstructed here is the original's own roll
// (`A.EXE`, D11): the number of hours, the chance and the wake-up call are this project's,
// stamped as such, and the shape of it — the level comes to you — is the one the owner
// described.

/**
 * How long a creature roused by a sleeper keeps coming, in the scene's own seconds.
 *
 * A minute is long enough to cross a level's worth of corridor at a walk and short enough
 * that a player who fights their way out is not followed for the rest of the visit.
 */
export const HUNT_SECONDS = 60;

/**
 * Rouse the level: whoever is alive in it starts hunting the sleeper.
 *
 * The mark is a deadline on the creature itself (`spawn.huntingUntil`), not a flag on the
 * level, so a creature killed on the way stops being a threat with the rest of it, and the
 * band it hunts in (`isHunting`) needs nothing else to know about the sleep.
 *
 * @param {object[]} spawns the scene's live spawns
 * @param {number} seconds the scene's own clock (`dbg.seconds`)
 * @param {{hold?: number}} [opts]
 * @returns {{roused: number}} how many creatures are now coming
 */
export function stirTheLevel(spawns, seconds, { hold = HUNT_SECONDS } = {}) {
  const now = Number(seconds) || 0;
  const until = now + Math.max(0, Number(hold) || 0);
  let roused = 0;
  for (const spawn of spawns ?? []) {
    if (!spawn || spawn.down) continue;
    if ((spawn.monster?.health ?? 1) <= 0) continue;   // a corpse does not hear anything
    // A deadline is never *shortened*: a creature already hunting keeps the later one.
    spawn.huntingUntil = Math.max(Number(spawn.huntingUntil) || 0, until);
    roused++;
  }
  return { roused };
}

/**
 * Is this creature hunting the player right now?
 *
 * Its own band is the ordinary case (`AGGRO` in `interior.js`): a creature notices a player it
 * can see nearby. Roused by a sleep, it comes from anywhere in the level until its deadline
 * passes — which is what makes the walk back out of a dungeon after a night's camp a walk
 * with company.
 *
 * @param {{huntingUntil?: number}|null|undefined} spawn
 * @param {number} distance world units
 * @param {number} now the scene's own seconds
 * @param {{aggro?: number}} [opts]
 * @returns {boolean}
 */
export function isHunting(spawn, distance, now, { aggro = Infinity } = {}) {
  if (distance <= aggro) return true;
  return (Number(spawn?.huntingUntil) || 0) > (Number(now) || 0);
}

/** How many species this install has, for the tests and the HUD. */
export const MONSTER_SPECIES = MONSTERS.length;
