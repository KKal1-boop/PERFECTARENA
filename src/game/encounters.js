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
import { attackInterval, rollMonster } from './combat.js';
import { humanLevel, humanLoot, humanShare, rollHuman } from './humans.js';
import { MONSTERS, monsterById, rosterFor } from './monsters.js';

/**
 * **The powerful version of an ordinary creature** — Daggerfall's high-level variants, which
 * own a golden outline, a doubled body and a purse worth taking.
 *
 * `A.EXE`'s own elite roll is not in this checkout (D11), so the threshold and the chance are
 * this project's stated numbers: from level 8, one in six ordinary creatures is an elite. The
 * *shape* is the reference's: a normal enemy made dangerous, not a new species — it keeps the
 * kind's sprite and name, and its circle attack and loot are what mark it.
 */
export const ELITE_LEVEL = 8;
export const ELITE_CHANCE = 18;

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
 * @param {{row: number, col: number}} [opts.near]  keep the encounter around this cell — a
 *   country job's own camp, rather than anywhere on the page
 * @param {number} [opts.radius]  how far from `near` a monster may stand (cells); 0 = anywhere
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
        // **A tube is a way through** (the owner, 2026-10-19): a chasm cell under a wall is
        // crawl space a player really uses, so the reachability flood crosses it instead of
        // treating every pool and underpass as a sealed room. A plain wall is still a wall;
        // a solid cell with a chasm floor is the tube.
        const chasm = Boolean(cell?.floor?.chasm);
        if (!cell || (!chasm && cell.solid && cell.kind !== 'door')) continue;
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
  let pool = far.length ? far : standable;
  // **A country camp is a place, not a page.** A wild job's quarry stands around the target
  // cell the quest marked, and the player can find them by walking to it; without this the
  // three wolves a hunt names could be anywhere in a 128×128 window.
  const near = opts.near && Number.isFinite(Number(opts.near.row)) && Number.isFinite(Number(opts.near.col))
    ? { row: Number(opts.near.row), col: Number(opts.near.col) } : null;
  const radius = Math.max(0, Number(opts.radius) || 0);
  if (near && radius > 0) {
    const around = pool.filter((c) => Math.hypot(c.row - near.row, c.col - near.col) <= radius);
    if (around.length) pool = around;
  }

  const wanted = Math.max(0, Math.min(opts.count ?? 3, pool.length));
  const spawned = [];
  // **Human enemies** (UESP's second bestiary section, D-67). They are drawn from the same
  // cells as a creature, but not from the cells' own roster: UESP says a human may be *any*
  // class and race, so a human's kind is rolled rather than looked up. `opts.humans` carries
  // the player's level (the page's own level rule) and whether this is a quest dungeon; a
  // caller that passes nothing gets the port's bestiary with no humans in it, exactly as
  // before.
  const humans = opts.humans ?? null;
  const share = humans ? humanShare({ quest: Boolean(humans.questDungeon) }) : 0;
  let pendingHuman = false;
  // Draw without replacement, so two monsters never stand in the same cell — **and with room
  // between them**. The owner, 2026-10-19: *"they need to be well spread around dungeons"*. The
  // first version was uniform without replacement, which is not the same thing: a level whose
  // standable cells are a few corridors drew its whole encounter in one room often enough to read
  // as a pile, and the scene's `separateBodies` then only pushed them a shoulder apart.
  //
  // The rule is the draw's own: a cell is only eligible while it is more than `spread` cells from
  // every cell already chosen. When the room runs out of room the spread is relaxed rather than
  // the count cut, because an encounter of four is the level's own promise (`spawnEncounter`'s
  // `count`) and standing close is worse than standing nowhere — but the second and third try keep
  // as much distance as the level can give.
  const cells = pool.slice();
  const spread = Math.max(0, Math.trunc(opts.spread ?? 3));
  const chosen = [];
  const farEnough = (cell, gap) => chosen.every((other) => Math.max(
    Math.abs(other.row - cell.row), Math.abs(other.col - cell.col)) > gap);
  for (let i = 0; i < wanted; i++) {
    let eligible = spread > 0 ? cells.filter((cell) => farEnough(cell, spread)) : cells;
    if (!eligible.length && spread > 0) eligible = cells.filter((cell) => farEnough(cell, 1));
    if (!eligible.length) eligible = cells;
    const pick = random.nextBelow(eligible.length);
    const place = eligible[pick];
    cells.splice(cells.indexOf(place), 1);
    chosen.push(place);
    // The kind is drawn from the **reachable window** of the level's own list (`rosterWindow`),
    // uniformly inside it: a level whose window holds six kinds fields those six, and depth and
    // danger are what widen the window. The *statistics* still scale with the danger rating
    // below, which is the original's own division of labour between a level's bestiary and its
    // difficulty.
    // A group is drawn together ("humans met in groups"): when one roll says human and the
    // group roll says so too, the next cell is a human as well.
    const isHuman = pendingHuman || (share > 0 && random.nextBelow(100) < share * 100);
    pendingHuman = false;
    let monster;
    let loot = null;
    if (isHuman) {
      const group = random.nextBelow(100) < 45;
      const level = humanLevel({ playerLevel: humans.playerLevel ?? danger, questDungeon: Boolean(humans.questDungeon), group, random });
      monster = rollHuman({ level, random, group, questDungeon: Boolean(humans.questDungeon) });
      monster.nextAttack = attackInterval(monster) * (0.5 + random.nextBelow(100) / 100);
      loot = humanLoot(monster, random);
      if (group) pendingHuman = true;
    } else {
      const kind = roster[random.nextBelow(roster.length)];
      monster = rollMonster(kind, random, { level: Math.max(1, danger + random.nextBelow(3) - 1) });
    }
    // ── the elite ────────────────────────────────────────────────────────────
    // A high-level ordinary creature may be the powerful version of its kind: double the body,
    // half again the blow, its own circle attack (and, for a caster, bolts between circles), and
    // a purse of the class gear a person carries. It is flagged on the monster so the scene can
    // paint the golden outline and the target card can name it; the *kind* is unchanged.
    let elite = false;
    if (!isHuman && monster.level >= ELITE_LEVEL && random.nextBelow(100) < ELITE_CHANCE) {
      elite = true;
      const maxHealth = Math.max(1, Math.round(monster.maxHealth * 2));
      monster = {
        ...monster,
        elite: true,
        maxHealth,
        health: maxHealth,
        damage: monster.damage.map((value) => Math.max(1, Math.round(value * 1.5))),
        damageMin: Math.max(1, Math.round(monster.damageMin * 1.5)),
        damageMax: Math.max(1, Math.round(monster.damageMax * 1.5)),
        xpRate: (monster.xpRate ?? 0) * 1.5,
      };
      loot = humanLoot({ level: monster.level, human: { classId: 'warrior' } }, random);
    }
    spawned.push({
      ...(loot ? { loot } : {}),
      ...(isHuman ? { human: true } : {}),
      ...(elite ? { elite: true } : {}),
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
 * How many creatures a **wilderness** window holds: the two ends of the country's ladder, and
 * the count a room-sized window keeps.
 *
 * Read against `monsters.js`'s own levels: the smallest number a road ever holds (3) is a pack
 * of rats and a wolf, and the largest (12) is a stretch of country where four or five of them
 * are worth killing at once. A window under 400 cells keeps the room's own count (2), because
 * that is what it is — a shrine in a clearing, a farmyard.
 */
export const WILDERNESS_MONSTER_COUNT = Object.freeze({ small: 2, min: 3, max: 12 });

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
 * @param {boolean} [opts.wilderness]  **a window of the country** (not a room somebody built):
 *   the `.INF`-roster law below cannot apply to it, because no wilderness `.INF` names a
 *   creature (`TWN`/`DWN`/`MWN` place three item flats and no monster) and the country is
 *   not empty in the original — see `game/wildernessBestiary.js` and D-02a
 * @returns {number}
 */
export function monsterCountFor(opts = {}) {
  const danger = opts.danger ?? 4;
  const size = (opts.level?.width ?? 0) * (opts.level?.depth ?? 0);
  // ── the country is not a room (2026-10-16, D-02a) ────────────────────────────
  //
  // **A wilderness window names no creature, and that is not the same as having none.** The
  // audit's S-B run (2026-10-15) found `TWN.INF`, `DWN.INF` and `MWN.INF` placing three item
  // flats (`itemIndexes [15, 2, 14]`), none in the monster range — so `monsterRosterFromInf`
  // answered `[]`, the "a level that names nothing gets none" law below answered 0, and every
  // window of country in the game was empty of creatures. Arena's own wilderness table lived in
  // `A.EXE`, which this data set does not ship (D11), so the count here is this project's rule
  // and is stamped as such (`game/wildernessBestiary.js` holds the table itself, per climate and
  // per half of the day).
  //
  // The ladder is deliberately the *same shape* as the room ladder below, one step gentler at
  // the small end: a window of country is bigger than a shop and smaller than a dungeon's
  // depths, and the danger of the place is what moves it (a stage-1 road holds four, an
  // eighth-stage road can hold twelve). A window under 400 cells is still a *room-sized* window
  // — a city's yard, a shrine in a clearing — and keeps the small count, exactly as the room
  // law does.
  if (opts.wilderness) {
    if (size && size < 400) return WILDERNESS_MONSTER_COUNT.small;
    const ladder = 4 + Math.floor(Math.max(0, danger - 2) / 4);
    return Math.max(WILDERNESS_MONSTER_COUNT.min, Math.min(WILDERNESS_MONSTER_COUNT.max, ladder));
  }
  // A level that names no monster of its own gets none. **The sentence that used to stand
  // here justified that law wrongly**, and the 2026-10-15 audit caught it (D-02b): it said
  // `start.inf` "lists keys, equipment and treasure and not one creature". Measured with
  // `monsterRosterFromInf`, `start.inf` names **23 species** — itemIndexes 1…8 and 32…54, rat
  // through lich — and the Imperial Dungeons field five of them. The law keeps its own
  // footing (a level that names nothing gets nothing); the false justification is gone.
  //
  // **What it used to cost was the whole country** — `TWN.INF`, `DWN.INF` and `MWN.INF` place
  // three item flats and no creature, so a wilderness window reached this line with `[]`. The
  // wilderness clause above answers first now, and a window that names nothing **and is not
  // wilderness** (a shop, a tavern, an inn's own `.INF`) still gets nothing, which is the law
  // this line was always about. A level that names some keeps its own breed and a count by
  // danger.
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
 * How many of Tharn's minions arrive with his vision.
 *
 * The install's own text says they come — *"I will use the same dream bridge that she uses,
 * sending my minions across time and space. Already they arrive"* (`TEMPLATE.DAT` 1392), *"my
 * minions arrive"* (1396), *"my legions await"* (1399) — and says nothing about how many:
 * `A.EXE`'s encounter table is not in this checkout (D11). Three is this project's number, and
 * it is stamped as such: enough that the vision has a fight behind it, few enough that a
 * level-2 character can answer it with the level's own low-tier creatures.
 */
export const AMBUSH_MINIONS = 3;

/**
 * How much faster than its own walk a roused creature comes, as a multiplier.
 *
 * **This project's rule** (the original's own roll is `A.EXE`'s, D11), and it exists because of the
 * owner's report on 2026-10-17: *"it just tells you theres people around but they never get close
 * and you dont rest"*. A roused creature used to keep its ordinary 2.6 m/s walk, so a wolf 90 m
 * out in the country needed **35 seconds** to arrive and one at 200 m needed 77 — longer than the
 * hunt itself, and far longer than a player waits before pressing `R` again. Measured on a live
 * country page: four creatures roused, the nearest closing from 48 m to 2 m over 32 seconds and
 * then standing still, the camp refused meanwhile. A hunt is a run.
 */
export const HUNT_RUN = 1.6;

/**
 * How long a roused creature may make no headway before the hunt is dropped, in seconds.
 *
 * A hunter whose way is barred (a wall between it and the sleeper, a lake, the courtyard of the
 * ruin it spawned in) used to press at the obstruction until the deadline, staying "on its way"
 * for a full minute and keeping a camp refused in the meantime — the *"they never get close"* half
 * of the same report. A body that has not closed half a metre in four seconds has lost the trail.
 */
export const HUNT_STALL_SECONDS = 4;

/** The headway that counts as progress, in world units (half a metre). */
export const HUNT_PROGRESS = 0.5;

/**
 * Rouse the level: whoever is alive in it starts hunting the sleeper.
 *
 * The mark is a deadline on the creature itself (`spawn.huntingUntil`), not a flag on the
 * level, so a creature killed on the way stops being a threat with the rest of it, and the
 * band it hunts in (`isHunting`) needs nothing else to know about the sleep.
 *
 * **Only a creature that can actually reach the sleeper in the hold is roused**, and the answer
 * says how far off the nearest one is. The owner's report needs both halves to be true at once:
 * a count that names creatures which cannot arrive is a promise the game then breaks (*"it just
 * tells you theres people around but they never get close"*), and a line with no distance gives a
 * player nothing to wait for. A creature further than `reach` — or one whose hunt was already
 * given up (`huntStalled`) — is not counted and not marked.
 *
 * @param {object[]} spawns the scene's live spawns
 * @param {number} seconds the scene's own clock (`dbg.seconds`)
 * @param {{hold?: number, reach?: number, distanceOf?: (spawn: object) => number}} [opts]
 * @returns {{roused: number, nearest: number|null, hold: number}} how many are coming, and how far
 *   off the closest of them is (world units), or `null` when none is
 */
export function stirTheLevel(spawns, seconds, { hold = HUNT_SECONDS, reach = Infinity, distanceOf = null } = {}) {
  const now = Number(seconds) || 0;
  const until = now + Math.max(0, Number(hold) || 0);
  let roused = 0;
  let nearest = null;
  for (const spawn of spawns ?? []) {
    if (!spawn || spawn.down) continue;
    if ((spawn.monster?.health ?? 1) <= 0) continue;   // a corpse does not hear anything
    // **A reach the body cannot cross is not a hunt.** The distance is the scene's own reading
    // (`distanceOf`), or the spawn's `distance` when the scene has already stepped it.
    const distance = Number(typeof distanceOf === 'function' ? distanceOf(spawn) : spawn.distance);
    if (Number.isFinite(distance) && distance > reach) continue;
    // A deadline is never *shortened*: a creature already hunting keeps the later one.
    spawn.huntingUntil = Math.max(Number(spawn.huntingUntil) || 0, until);
    spawn.huntStall = null;                            // a fresh hunt starts its own progress watch
    roused++;
    if (Number.isFinite(distance) && (nearest === null || distance < nearest)) nearest = distance;
  }
  return { roused, nearest, hold };
}

/**
 * Has this hunter stopped making headway? Called once a frame by the scene's step.
 *
 * The watch is kept on the creature (`huntStall`): `{ at, from }`, the last time it was seen to
 * close `HUNT_PROGRESS`, and the distance it was at then. A body that has not closed half a metre
 * in `HUNT_STALL_SECONDS` has lost the trail; the scene drops its hunt and it stops being a
 * promise. Answers **true** on the frame the hunt is dropped, so the caller can report it once.
 *
 * @param {object} spawn
 * @param {number} distance world units, this frame
 * @param {number} now the scene's own seconds
 * @param {{stall?: number, progress?: number}} [opts]
 * @returns {boolean}
 */
export function huntStalled(spawn, distance, now, { stall = HUNT_STALL_SECONDS, progress = HUNT_PROGRESS } = {}) {
  if (!spawn || !Number.isFinite(distance)) return false;
  const watch = spawn.huntStall;
  if (!watch || distance <= watch.from - progress) {
    spawn.huntStall = { at: Number(now) || 0, from: distance };
    return false;
  }
  if ((Number(now) || 0) - watch.at < stall) return false;
  spawn.huntStall = null;
  spawn.huntingUntil = 0;
  return true;
}

/**
 * Is this creature still hearing a sleeper — a hunt a camp gave it that has not run out?
 *
 * **This is the half of `isHunting` that is about a *hunt*, as opposed to a creature's own
 * band**, and the two are asked separately because they license different things: a creature
 * inside its band may strike at what it sees (`interior.js`'s `spawn.sees`), while a roused
 * creature *walks* toward the sleeper from anywhere in the level, seeing them or not. Without
 * that distinction the level answered a camp with "4 of them are coming" and then never
 * moved — measured on a country page 2026-10-17: four creatures roused, and their distances
 * (41 m, 90 m, 129 m, 202 m) **byte-identical four seconds later**. The movement gate was
 * `spawn.awake`, which is "inside my band and I can see you", so a creature beyond the band
 * was marked as hunting and then skipped by the very step that would have brought it.
 *
 * @param {{huntingUntil?: number}|null|undefined} spawn
 * @param {number} now the scene's own seconds
 * @returns {boolean}
 */
export function isRoused(spawn, now) {
  return (Number(spawn?.huntingUntil) || 0) > (Number(now) || 0);
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
  return isRoused(spawn, now);
}

/** How many species this install has, for the tests and the HUD. */
export const MONSTER_SPECIES = MONSTERS.length;
