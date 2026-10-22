// RADIANT QUESTS — Arena's world, Daggerfall's habit of never running out of work.
//
// Arena's main quest is a fixed chain of eight pieces. Its *side* quests are where
// Daggerfall's engine gets to do what it is famous for: an endless supply of small,
// procedurally-described jobs offered by whoever happens to be standing in the
// tavern, aimed at whatever place the world data actually has.
//
// Nothing here is a scripted scenario. A quest is a draw from Arena's own world:
//
//   the giver       a settlement in `CITYDATA.64` (or the one the player is in)
//   the target      a **dungeon whose `.MIF` really exists in the player's install**
//   the prose       `artfact1.dat` / `artfact2.dat` where the kind allows it,
//                   the game's own vocabulary where it does not
//   the distance    `world.travel()`, so a deadline is measured in this map's days
//   the reward      scaled from that distance and the target's danger tier
//
// Determinism is the whole safety net. A quest is a pure function of
// `(world, library, kind, seed, giver, day)`, so the same seed offers the same job,
// the browser suite can assert on a specific offer, and a save file is just the
// seed plus the accepted quest's state.
//
// ## What is drawn from data, and what is authored
//
// Stated plainly, because it matters which is which:
//
//   `ARTIFACTS`   the fourteen artifact names that **actually occur in the artifact
//                 banks** — `tests/unit/radiant.test.mjs` reads the real files and
//                 requires every name in this table to be found in them.
//   `MONSTERS`    Arena's creature sprite sets, read off the archive's `.CFA`
//                 filenames (`GOBLIN*.CFA`, `GHOUL*.CFA`, `ZOMBIE*.CFA`, …). The
//                 unit test checks every stem here against the real archive, in the
//                 same spirit as the city-block tables (D5).
//   `ITEMS`       **AUTHORED.** Arena's equipment names live in `A.EXE`, which this
//                 install does not ship (D11), so a fetch quest's trinket is named
//                 from Arena's documented equipment vocabulary rather than read.
//                 Logged as S20/S21 in PROGRESS.md.
//
// A quest can therefore never point at a place the game cannot open, and the prose
// can never promise an artifact Arena's own text does not mention.

import { ArenaRandom } from './arenaRandom.js';
import { fillTemplate } from '../arena/arenaText.js';
import { DUNGEON_BLOCKS_MIF } from './dungeonPlan.js';
import { stageMif } from './questData.js';
import { personId } from './regard.js';
import { CELLS_PER_PIXEL, pixelOfCell } from './tamrielGrid.js';
import { MONSTERS as BESTIARY } from './monsters.js';

/** Authored bounty contract. Original Arena monster art/stats, three actual combat targets. */
export function slayProgress(quest) {
  if (quest?.kind !== 'slay' && quest?.kind !== 'hunt') return null;
  const named = MONSTERS.find(m => `${m.name}s` === quest.subject || m.cfa === quest.combat?.monster);
  const kind = BESTIARY.find(m => m.sprite?.replace(/0$/, '') === named?.cfa);
  if (!kind) return null;
  const required = Math.max(1, Math.min(6, Math.floor(Number(quest.combat?.required) || 3)));
  const ids = Array.from({ length: required }, (_, i) => `${quest.id}#${i}`);
  const defeated = [...new Set((quest.combat?.defeated ?? []).filter(id => ids.includes(id)))];
  return { monster: kind.id, required, defeated, ids };
}

/**
 * Arena's artifacts — every one of them a phrase that appears in `artfact1.dat`
 * or `artfact2.dat`, which the unit test enforces. `tier` is only used to scale a
 * reward; it is not read from the data.
 * @type {ReadonlyArray<{name: string, tier: number}>}
 */
export const ARTIFACTS = Object.freeze([
  { name: "Lord's Mail", tier: 2 },
  { name: 'Staff of Magnus', tier: 3 },
  { name: 'Ebony Blade', tier: 3 },
  { name: 'Chrysamere', tier: 3 },
  { name: 'Oghma Infinium', tier: 1 },
  { name: 'Ring of Phynaster', tier: 2 },
  { name: 'Ring of Khajiit', tier: 2 },
  { name: "Skeleton's Key", tier: 2 },
  { name: "Warlock's Ring", tier: 2 },
  { name: "Auriel's Bow", tier: 3 },
  { name: "Auriel's Shield", tier: 3 },
  { name: 'Ebony Mail', tier: 3 },
  { name: 'Spell Breaker', tier: 3 },
  { name: 'Volendrung', tier: 3 },
]);

/**
 * The creatures, named from the archive's own sprite-set filenames. `cfa` is the
 * stem each name must be found under (see `tests/unit/radiant.test.mjs`), and
 * `tier` scales a quest's reward.
 * @type {ReadonlyArray<{name: string, cfa: string, tier: number}>}
 */
export const MONSTERS = Object.freeze([
  { name: 'rat', cfa: 'RAT', tier: 1 },
  { name: 'goblin', cfa: 'GOBLIN', tier: 1 },
  { name: 'hound', cfa: 'HOUND', tier: 1 },
  { name: 'ghoul', cfa: 'GHOUL', tier: 2 },
  { name: 'skeleton', cfa: 'SKELE', tier: 2 },
  { name: 'zombie', cfa: 'ZOMBIE', tier: 2 },
  { name: 'orc', cfa: 'ORC', tier: 2 },
  { name: 'spider', cfa: 'SPIDER', tier: 2 },
  { name: 'lizard man', cfa: 'LIZARD', tier: 2 },
  { name: 'wolf', cfa: 'WOLF', tier: 2 },
  { name: 'ghost', cfa: 'GHOST', tier: 3 },
  { name: 'wraith', cfa: 'WRAITH', tier: 3 },
  { name: 'troll', cfa: 'TROLL', tier: 3 },
  { name: 'medusa', cfa: 'MEDUSA', tier: 3 },
  { name: 'vampire', cfa: 'VAMPIRE', tier: 4 },
  { name: 'lich', cfa: 'LICH', tier: 4 },
  { name: 'daedra', cfa: 'DEAMON', tier: 4 },
]);

/**
 * Trinkets for a fetch or a delivery. **AUTHORED** — see this file's header.
 * @type {ReadonlyArray<{name: string, tier: number}>}
 */
/**
 * Things that grow or lie in the country, for a gathering job. **AUTHORED**, like the trinkets:
 * Arena's plant and loot names live in `A.EXE` (D11), so these are written in the game's voice
 * rather than read. A gathering job names one of them instead of a town trinket, because a
 * silver locket does not grow in a meadow.
 * @type {ReadonlyArray<{name: string, tier: number}>}
 */
export const GATHERINGS = Object.freeze([
  { name: "a sprig of dragon's tongue", tier: 1 },
  { name: 'a bundle of marsh moss', tier: 1 },
  { name: 'a cluster of night-cap mushrooms', tier: 1 },
  { name: 'a shard of raw crystal', tier: 2 },
  { name: 'a handful of grave-salt', tier: 2 },
  { name: 'a piece of fallen star-metal', tier: 3 },
]);

export const ITEMS = Object.freeze([
  { name: 'a silver locket', tier: 1 },
  { name: 'a brass key', tier: 1 },
  { name: 'a sealed letter', tier: 1 },
  { name: 'a bundle of herbs', tier: 1 },
  { name: 'an old map', tier: 2 },
  { name: 'a religious relic', tier: 2 },
  { name: 'a jewelled ring', tier: 2 },
  { name: 'a merchant\'s ledger', tier: 2 },
  { name: 'a family heirloom', tier: 3 },
  { name: 'a dwemer cog', tier: 3 },
]);

/**
 * The eight kinds of work the board can offer.
 *
 * `data: true` marks the kinds whose offer text is Arena's own (`artfact*.dat`);
 * the others are written here in the game's voice and say so. `where` says where the
 * work happens — a dungeon, the open country, or either — and is how the board keeps
 * half its work out of the same fourteen crypts: a hunter, a herb-gatherer and a
 * missing traveller are all reasons to walk out of the gate rather than down a stair.
 *
 * @type {ReadonlyArray<{id: string, label: string, data: boolean, needsDungeon: boolean, where: 'dungeon'|'wild'|'either'}>}
 */
export const RADIANT_KINDS = Object.freeze([
  { id: 'artifact', label: 'recover an artifact', data: true, needsDungeon: true, where: 'dungeon' },
  { id: 'slay', label: 'clear a lair', data: false, needsDungeon: true, where: 'dungeon' },
  { id: 'hunt', label: 'hunt in the wild', data: false, needsDungeon: false, where: 'wild' },
  { id: 'fetch', label: 'fetch a lost thing', data: false, needsDungeon: true, where: 'dungeon' },
  { id: 'gather', label: 'gather a rare thing', data: false, needsDungeon: false, where: 'wild' },
  { id: 'rescue', label: 'rescue a captive', data: false, needsDungeon: false, where: 'either' },
  { id: 'deliver', label: 'carry a message', data: false, needsDungeon: false, where: 'either' },
  { id: 'investigate', label: 'find a missing traveller', data: false, needsDungeon: false, where: 'wild' },
]);

/** How many offers a board shows at once. Arena's own guilds offer one at a time;
 * three is enough to feel like a board and few enough to read. */
export const OFFERS_PER_BOARD = 3;

/**
 * Choose the artifacts, creatures and trinkets a campaign will actually use.
 *
 * Kept separate from generation so a caller can pass its own (a mod, a test).
 *
 * @typedef {object} RadiantTables
 * @property {ReadonlyArray<object>} artifacts
 * @property {ReadonlyArray<object>} monsters
 * @property {ReadonlyArray<object>} items
 */

/** The default tables — Arena's own where it has them. */
export const DEFAULT_TABLES = Object.freeze({ artifacts: ARTIFACTS, monsters: MONSTERS, items: ITEMS });

/**
 * @typedef {object} RadiantQuest
 * @property {string} id          stable, derived from the seed
 * @property {string} kind        one of `RADIANT_KINDS`
 * @property {string} giver       the settlement that offers it
 * @property {number} giverProvinceID
 * @property {string} title
 * @property {string} text        the offer, in full prose
 * @property {boolean} dataText   whether `text` came from Arena's own files
 * @property {string} source      where the prose came from, for the player to see
 * @property {string} target      the place the work happens
 * @property {string|null} targetMif
 * @property {object} targetGlobal  world pixel, so the map can mark it
 * @property {string} subject     what is being hunted / fetched / carried
 * @property {number} days        the deadline, in in-world days
 * @property {number} reward      gold
 * @property {number} tier
 * @property {number} offeredOn   the in-world day the offer was made
 * @property {string|null} [giverId]     the person who asked, by place-and-cell (`regard.js`)
 * @property {string|null} [giverPerson] how they read to the player (`a person in chain mail`)
 * @property {string|null} [giverArmour] the armour word out of their file's name
 */

/**
 * The settlements a quest may name: the country's own places, minus the records
 * `CITYDATA` leaves anonymous.
 *
 * Arena's city table is a fixed 32 slots per province, and a province that does
 * not use all of them ships the unused ones as empty records — **31 of them in
 * this install**, invisible on the map and with no name at all. They are real
 * rows with real coordinates, so anything that draws a settlement at random out
 * of `world.settlements()` can land on one: a delivery whose "Carry word to"
 * names nowhere, and a journal line that says `Travel to  — ...`. Measured by
 * `tests/unit/radiant.test.mjs`, which sweeps every kind over many seeds and
 * requires a name every time.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @returns {object[]}
 */
export function namedSettlements(world) {
  return world.settlements().filter((s) => Boolean(s.name));
}

/**
 * Turn a world location into the `{name, global, mif, province}` shape a quest
 * points at.
 *
 * @param {object} location
 * @param {string} province
 * @returns {{name: string, global: {x:number,y:number}, mif: string|null, province: string, climate: string}}
 */
function targetOf(location, province) {
  return {
    name: location.name,
    kind: location.kind === 'dungeon' ? 'dungeon' : 'settlement',
    global: { x: location.global.x, y: location.global.y },
    mif: location.kind === 'dungeon' ? stageMif(location) : null,
    province,
    climate: location.climate,
    near: null,
    cell: null,
    anchor: location.name,
  };
}

/**
 * **A job in the open country.**
 *
 * The owner, 2026-10-19: *"some [radiant jobs] should also point to the wilderness instead of
 * the dungeon of a city … not too far from a dungeon or city or village point of interest but
 * nevertheless in the wilderness"*. So a wild target is a **world pixel just outside a real
 * landmark** (a settlement or a dungeon in the giver's province), and its cell is the middle
 * of that pixel — open country the persistent world already knows how to build, never the
 * inside of a town.
 *
 * **The anchor is a town, village or city, and the spot is just outside it.** The latest
 * owner's report (2026-10-19) is the rule: *"the questmarker should be closer to a dungeon
 * village or town so you can teleport there instead and then reach the location walking in
 * the wilderness"*, and then *"in the map it appears 'your job near North Keep' that is too far
 * from North Keep to reasonably walk to it"*. So the anchor is drawn **first** — a settlement
 * in the giver's own province — and the spot is measured in **cells out of that town's gate**,
 * not in whole map pixels: 130–175 cells (roughly 325–440 metres) in one of the four cardinal
 * directions. That is the next pixel over, so the map can draw the job's own mark beside the
 * town instead of under its icon, and it is a short walk rather than a second journey. The
 * player travels to the anchor (`?location=<anchor>`), then walks the last leg. A dungeon is
 * never the anchor: `?location=` needs a settlement record, and a job anchored on one could be
 * a second journey from the nearest town.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {object} giver  the settlement offering the work
 * @param {ArenaRandom} random
 * @returns {{name: string, kind: 'wild', global: {x:number,y:number}, mif: null,
 *   province: string, climate: string, near: string, cell: {row:number,col:number},
 *   anchor: string, anchorID: number|null, anchorProvinceID: number, walk: number}}
 */
function wildTargetOf(world, giver, random) {
  const provinceID = giver.provinceID;
  const settlements = world.settlements().filter((s) => s.provinceID === provinceID && s.name);
  const pool = settlements.length ? settlements : [giver];
  const anchorPlace = pool[random.nextBelow(pool.length)];
  const base = anchorPlace.tamriel ?? anchorPlace.global ?? giver.tamriel ?? giver.global;
  // The town's own cell: the middle of the painted pixel its icon stands on. Offsets are
  // added to this, so "how far" is the walk the player actually makes, not a pixel count.
  const anchorCell = {
    row: base.y * CELLS_PER_PIXEL + CELLS_PER_PIXEL / 2,
    col: base.x * CELLS_PER_PIXEL + CELLS_PER_PIXEL / 2,
  };
  // A short ring of country out of the **anchor's gate**: 130–175 cells (about 325–440 m)
  // along one of the four cardinal roads. The first step past half a pixel enters the next
  // pixel, so the job's mark is drawn *beside* the town on the map rather than hidden under
  // the town's own icon, and the last leg stays a walk rather than a second journey. The first
  // land pixel in the giver's province wins; a sea edge or a border is skipped.
  const CARDINALS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  let chosen = null;
  for (const distance of [130, 150, 175]) {
    const start = random.nextBelow(4);
    for (let step = 0; step < 4; step++) {
      const [dy, dx] = CARDINALS[(start + step) % 4];
      const row = anchorCell.row + dy * distance;
      const col = anchorCell.col + dx * distance;
      const point = pixelOfCell(row, col);
      if (point.x === base.x && point.y === base.y) continue;
      const province = world.provinceAtWorld(point);
      if (!province || province.id !== provinceID) continue;
      if (!world.landAt(point, provinceID)) continue;
      chosen = { row, col, point };
      break;
    }
    if (chosen) break;
  }
  // Every cardinal road was sea or another province. A coast town can still have land
  // behind it on a diagonal, so try the same short ring in eight directions before settling
  // for the town's own centre — the walk must stay short whatever the coastline does.
  if (!chosen) {
    for (const distance of [130, 150, 175]) {
      const start = random.nextBelow(8);
      for (let step = 0; step < 8; step++) {
        const angle = ((start + step) % 8) * (Math.PI / 4);
        const row = anchorCell.row + Math.round(Math.sin(angle) * distance);
        const col = anchorCell.col + Math.round(Math.cos(angle) * distance);
        const point = pixelOfCell(row, col);
        const province = world.provinceAtWorld(point);
        if (!province || province.id !== provinceID) continue;
        if (!world.landAt(point, provinceID)) continue;
        chosen = { row, col, point };
        break;
      }
      if (chosen) break;
    }
  }
  if (!chosen) {
    chosen = { row: anchorCell.row, col: anchorCell.col, point: { x: base.x, y: base.y } };
  }
  const province = anchorPlace.province ?? giver.province;
  const anchor = anchorPlace.name ?? giver.name;
  // How far the walk out of the anchor really is, in cells — the card says it, because a
  // job the player cannot fast travel to has to say how far the last leg is.
  const walk = Math.max(1, Math.round(Math.hypot(chosen.row - anchorCell.row, chosen.col - anchorCell.col)));
  const climate = world.worldClimateAt(chosen.point);
  return {
    name: `the wilds near ${anchor}`,
    kind: 'wild',
    global: chosen.point,
    mif: null,
    province,
    climate,
    near: anchor,
    cell: { row: chosen.row, col: chosen.col },
    anchor,
    anchorID: anchorPlace.id ?? null,
    anchorProvinceID: anchorPlace.provinceID ?? provinceID,
    walk,
  };
}

/**
 * Move a country job that an **older save** left a long walk from its anchor back beside it.
 *
 * Jobs written before the cell-distance rule (2026-10-19) put their target one or two whole
 * map pixels out — 256–512 cells, the owner's *"too far from North Keep to reasonably walk
 * to it"*. The job itself is still valid (its anchor, prose and reward are untouched), so
 * rather than discard a player's work this draws the same direction out of the anchor's gate
 * and stops at 130–175 cells, exactly what `wildTargetOf` now does for new postings. The
 * marker, `targetWalk` and climate are updated together so the map and the objective agree.
 *
 * @param {object} state  a loaded radiant state
 * @param {import('./worldMap.js').WorldMap} world
 * @returns {boolean} whether anything was moved, so the caller can save the repair
 */
export function repairWildTargets(state, world) {
  const active = state?.active;
  if (!active || active.completed || active.targetKind !== 'wild' || !world) return false;
  const anchor = (active.targetAnchorID != null && active.targetAnchorProvinceID != null
    ? world.byId(active.targetAnchorProvinceID, active.targetAnchorID)
    : null) ?? world.byName(active.targetAnchor, active.targetAnchorProvinceID ?? null);
  const base = anchor?.tamriel ?? anchor?.global;
  if (!base) return false;
  const anchorCell = {
    row: base.y * CELLS_PER_PIXEL + CELLS_PER_PIXEL / 2,
    col: base.x * CELLS_PER_PIXEL + CELLS_PER_PIXEL / 2,
  };
  const old = active.targetCell;
  const oldWalk = Math.hypot((old?.row ?? anchorCell.row) - anchorCell.row,
    (old?.col ?? anchorCell.col) - anchorCell.col);
  if (Number(active.targetWalk ?? oldWalk) <= 200 && oldWalk <= 200) return false;
  // Keep the old bearing: the closest cardinal road out of the gate is the same direction
  // the posting already pointed, now just a short walk down it.
  const dRow = (old?.row ?? anchorCell.row + 1) - anchorCell.row;
  const dCol = (old?.col ?? anchorCell.col + 1) - anchorCell.col;
  const CARDINALS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const roads = [...CARDINALS].sort((a, b) => (b[1] * dCol + b[0] * dRow) - (a[1] * dCol + a[0] * dRow));
  for (const distance of [150, 130, 175]) {
    for (const [dy, dx] of roads) {
      const row = anchorCell.row + dy * distance;
      const col = anchorCell.col + dx * distance;
      const point = pixelOfCell(row, col);
      const province = world.provinceAtWorld(point);
      if (!province || province.id !== anchor.provinceID) continue;
      if (!world.landAt(point, anchor.provinceID)) continue;
      active.targetCell = { row, col };
      active.targetGlobal = point;
      active.targetWalk = distance;
      active.targetProvince = province.name;
      active.targetClimate = world.worldClimateAt(point);
      return true;
    }
  }
  return false;
}

/**
 * The dungeons a radiant quest may send the player to: the ones whose `.MIF` the
 * install actually has.
 *
 * This is the reason `radiant` can never strand a player in a place the game
 * cannot open. Only 16 of Arena's 144 dungeon records ship as a map file — the two
 * quest dungeons of each province — and the other 128 are the map's random dungeons,
 * which the original generates. The port assembles those from the install's own
 * dungeon pieces (`game/dungeonPlan.js`), so every one of the 144 is enterable and the
 * board draws its work from all of them (`enterableFromListing`).
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {(location: object) => boolean} enterable
 * @returns {object[]}
 */
export function enterableDungeons(world, enterable) {
  return world.locations.filter((l) => l.kind === 'dungeon' && enterable(l));
}

/**
 * Discover which dungeon `.MIF`s this install has, without reading `GLOBAL.BSA`.
 *
 * The archive holds no numeric-named `.MIF` at all (its 533 map records are city,
 * town, village and wilderness skeletons), so a loose-file listing answers the
 * question completely. `source.list()` is populated by the folder picker; the dev
 * server's index is fetched by `source.ensureListing?.()`.
 *
 * @param {import('../arena/arenaData.js').ArenaSource} source
 * @returns {Promise<Set<string>>} upper-case filenames
 */
export async function discoverLooseMifs(source) {
  if (typeof source?.ensureListing === 'function') await source.ensureListing();
  const names = typeof source?.list === 'function' ? source.list() : [];
  return new Set(names.map((n) => String(n).toUpperCase()));
}

/**
 * A predicate for `enterableDungeons` built from a loose-file listing.
 *
 * Two ways a dungeon can be opened, and the second is what makes **all 144** of them
 * destinations rather than sixteen:
 *
 *   * its own `.MIF` is in the folder (the two named quest dungeons of each province), or
 *   * the install's dungeon *pieces* are — `RANDOM1.MIF`, from which `game/dungeonPlan.js`
 *     assembles a level for any dungeon whose own map the original generated rather than
 *     shipped. The other 128 records are exactly those, so a job can now aim at any dungeon
 *     on the map instead of the same sixteen.
 *
 * @param {Set<string>} loose
 * @returns {(location: object) => boolean}
 */
export function enterableFromListing(loose) {
  const blocks = typeof DUNGEON_BLOCKS_MIF === 'string' && loose.has(DUNGEON_BLOCKS_MIF);
  return (location) => {
    const mif = stageMif(location);
    if (mif && loose.has(mif.toUpperCase())) return true;
    return blocks;
  };
}

/**
 * Draw one quest.
 *
 * @param {object} opts
 * @param {import('./worldMap.js').WorldMap} opts.world
 * @param {import('../arena/arenaText.js').ArenaLibrary} opts.library
 * @param {string} opts.kind            one of `RADIANT_KINDS`
 * @param {number} opts.seed            the draw
 * @param {object} opts.giver           the settlement offering it
 * @param {number} [opts.day]           the in-world day, for the deadline
 * @param {object[]} [opts.dungeons]    the enterable dungeons (see `enterableDungeons`)
 * @param {RadiantTables} [opts.tables]
 * @returns {RadiantQuest}
 */
export function generateQuest(opts) {
  const {
    world, library, kind, seed, giver, day = 1,
    dungeons = [], tables = DEFAULT_TABLES,
  } = opts;
  const spec = RADIANT_KINDS.find((k) => k.id === kind);
  if (!spec) throw new Error(`unknown radiant quest kind "${kind}"`);
  if (spec.needsDungeon && !dungeons.length) {
    throw new Error(`a "${kind}" quest needs an enterable dungeon; the install has none`);
  }

  const random = new ArenaRandom(seed >>> 0);
  // The giver's own province first: a job worth walking to, not a pilgrimage.
  const local = dungeons.filter((d) => d.provinceID === giver.provinceID);
  const pool = local.length ? local : dungeons;
  const dungeon = pool.length ? pool[random.nextBelow(pool.length)] : null;

  // **Dungeon or country.** A kind that can happen in either place draws for it, and an
  // install with no enterable dungeon sends even a rescue to the country rather than
  // refusing to offer the work at all. The draw is taken after the dungeon so an existing
  // seed still opens with the same dungeon; what changes is where the job's *prose* sends
  // the player, which is the point of the split.
  const wild = spec.where === 'wild'
    || (spec.where === 'either' && (!pool.length || random.nextBelow(100) < 50));

  const monster = tables.monsters[random.nextBelow(tables.monsters.length)];
  const trinket = tables.items[random.nextBelow(tables.items.length)];
  const gathering = (tables.gatherings ?? GATHERINGS)[random.nextBelow((tables.gatherings ?? GATHERINGS).length)];
  const artifact = tables.artifacts[random.nextBelow(tables.artifacts.length)];
  const settlements = namedSettlements(world);
  const elsewhere = settlements.filter((s) => s.provinceID !== giver.provinceID || s.name !== giver.name);
  const recipient = elsewhere.length ? elsewhere[random.nextBelow(elsewhere.length)] : giver;

  const target = wild ? wildTargetOf(world, giver, random)
    : spec.where === 'dungeon' ? targetOf(dungeon, dungeon.province)
      : targetOf(recipient, recipient.province);
  // A delivery has a *second* place: where it comes from, used for its prose.
  const away = targetOf(giver, giver.province);

  const id = `${seed >>> 0}:${kind}`;
  const common = {
    id, kind, giver: giver.name, giverProvinceID: giver.provinceID,
    target: target.name, targetMif: target.mif, targetGlobal: target.global,
    targetProvince: target.province, offeredOn: day,
    // **Where** the work happens: `dungeon`, `settlement`, or `wild`. A wild job also
    // carries the world cell and the settlement that anchors it, so the map can mark the
    // country and the arrival can boot `?location=<anchor>&wild=<cell>`.
    targetKind: target.kind, targetCell: target.cell ?? null, targetNear: target.near ?? null,
    targetAnchor: target.anchor ?? null, targetWalk: target.walk ?? null,
    targetAnchorID: target.anchorID ?? null, targetAnchorProvinceID: target.anchorProvinceID ?? null,
    targetClimate: target.climate ?? null,
  };

  /** @type {{title: string, text: string, subject: string, tier: number, dataText: boolean, source: string}} */
  let prose;
  switch (kind) {
    case 'artifact': {
      // Arena's own recruiting speech, with the player's details filled in.
      //
      // The speech *names the artifact it is offering*, so the artifact is read
      // back out of the prose rather than drawn independently — otherwise the title
      // could promise the Ebony Blade while the text sells the Staff of Magnus.
      // Only speeches that name one of `ARTIFACTS` are eligible, and the unit test
      // proves every one of those names is really in the banks.
      // Only speeches that name one of `ARTIFACTS` **and** read whole once filled: a lecture
      // that loses a word to a dropped `%` is not prose a player should be handed.
      const named = tables.artifacts.length ? library.artifactOffers
        .map((o) => ({ offer: o, artifact: tables.artifacts.find((a) => o.text.includes(a.name)) }))
        .filter((entry) => entry.artifact
          && !/\bthe\s+%nt\b/i.test(entry.offer.text)
          && offerReadsWhole(fillTemplate(entry.offer.text, artifactValues(world, giver, seed, entry.artifact, target))))
        : [];
      const pick = named.length ? named[random.nextBelow(named.length)] : null;
      const offer = pick?.offer ?? null;
      const chosen = pick?.artifact ?? artifact;
      const values = artifactValues(world, giver, seed, chosen, target);
      prose = {
        title: `Recover ${chosen.name}`,
        text: offer
          ? `${fillTemplate(offer.text, values)}\n\nThe road leads to ${target.name}, in ${target.province}.`
          : `Word is that ${chosen.name} was last seen in ${target.name}, in ${target.province}. Bring it back to ${giver.name}.`,
        subject: chosen.name,
        tier: chosen.tier,
        dataText: Boolean(offer),
        source: offer ? `Arena: ${offer.bank}` : 'authored',
        // **The purse the speech names.** Arena's recruiting speeches quote a price out of
        // `%oap` (the asking price) or `%nap` (half of it), and a speech that says "I'd
        // rather have 550 gold" while the journal promises 180 is the panel contradicting
        // itself in the game's own words. Measured over the install: of the 372 artifact
        // offers, **48** name the full price, **142** name half, and none names both — so
        // whichever word the speech uses is the number the player is agreeing to.
        price: !offer ? null
          : /%oap/.test(offer.text) ? values.oap
            : /%nap/.test(offer.text) ? values.nap : null,
        // *Which* word priced it, so the panel and the tests can tell a speech that asked for
        // a price from one that only described the place.
        priceWord: !offer ? null : /%oap/.test(offer.text) ? 'oap' : /%nap/.test(offer.text) ? 'nap' : null,
      };
      break;
    }
    case 'slay': {
      prose = {
        title: `Clear ${target.name} of ${monster.name}s`,
        text: `Word in ${giver.name} is that ${target.name}, out in ${target.province}, has gone bad. `
          + `${monster.name === 'daedra' ? 'Daedra' : `${monster.name[0].toUpperCase()}${monster.name.slice(1)}s`} `
          + `have taken the lower halls and travellers are being turned back at the door. `
          + `Defeat three of them in the lair and return; ${giver.name} will pay.`,
        subject: `${monster.name}s`,
        tier: monster.tier,
        dataText: false,
        source: 'authored',
      };
      break;
    }
    case 'hunt': {
      prose = {
        title: `Hunt the ${monster.name}s near ${target.anchor ?? target.name}`,
        text: `A pack of ${monster.name}s has been taking sheep and straying travellers out in ${target.name}, in ${target.province}. `
          + `Three of them are worth a purse to ${giver.name}, and the herders will sleep better for it.`,
        subject: `${monster.name}s`,
        tier: monster.tier,
        dataText: false,
        source: 'authored',
      };
      break;
    }
    case 'fetch': {
      prose = {
        title: `Recover ${trinket.name}`,
        text: `They say ${trinket.name} was carried into ${target.name}, in ${target.province}, and never carried out. `
          + `Bring it back to ${giver.name} and the rest is yours to keep.`,
        subject: trinket.name,
        tier: trinket.tier,
        dataText: false,
        source: 'authored',
      };
      break;
    }
    case 'gather': {
      prose = {
        title: `Gather ${gathering.name} near ${target.anchor ?? target.name}`,
        text: `The healer in ${giver.name} is short of ${gathering.name}, and the nearest patch grows out in ${target.name}, in ${target.province}. `
          + `Bring it back whole and ${giver.name} will pay for the walk.`,
        subject: gathering.name,
        tier: gathering.tier,
        dataText: false,
        source: 'authored',
      };
      break;
    }
    case 'rescue': {
      prose = {
        title: wild ? `Rescue a captive in ${target.name}` : `Rescue a captive from ${target.name}`,
        text: wild
          ? `Someone's kin was taken alive and is being held at a camp in ${target.name}, in ${target.province}. `
            + `${giver.name} has a purse for whoever walks out there and walks back with them.`
          : `Someone's kin was taken alive into ${target.name}, in ${target.province}, and is being held there. `
            + `${giver.name} has a purse for whoever walks in and walks out with them.`,
        subject: 'a captive',
        tier: monster.tier + 1,
        dataText: false,
        source: 'authored',
      };
      break;
    }
    case 'investigate': {
      prose = {
        title: `Find the missing scout near ${target.anchor ?? target.name}`,
        text: `A scout out of ${giver.name} went into ${target.name}, in ${target.province}, and has not come back. `
          + `${giver.name} will pay for word of them \u2014 and better for the scout themselves.`,
        subject: 'a missing scout',
        tier: Math.max(2, monster.tier),
        dataText: false,
        source: 'authored',
      };
      break;
    }
    case 'deliver':
    default: {
      prose = {
        title: wild ? `Carry word to the camp near ${target.anchor ?? target.name}` : `Carry word to ${target.name}`,
        text: wild
          ? `${giver.name} needs a letter carried to a hermit camped in ${target.name}, in ${target.province}, and will not trust it to a courier. `
            + `Say nothing to anyone on the road.`
          : `${giver.name} needs a letter in ${target.name}, in ${target.province}, and will not trust it to a courier. `
            + `Say nothing to anyone on the road.`,
        subject: 'a sealed letter',
        tier: 1,
        dataText: false,
        source: 'authored',
      };
      break;
    }
  }

  // A deadline that respects the map: enough days to walk there and back, at this
  // world's own scale, with slack for a bad road.
  const there = world.travel(away.global, target.global);
  const days = Math.max(4, Math.round(there.days * 2.4) + 2);
  // Gold from distance and danger, in the game's own order of magnitude — **unless the
  // offer's own prose already named a price**, which Arena's artifact speeches do. The
  // player is accepting the words on the panel, so the words are what is paid.
  const reward = Math.round((Number.isFinite(prose.price) && prose.price > 0
    ? prose.price
    : 18 + there.days * 9 + prose.tier * 45) / 5) * 5;

  return {
    ...common,
    title: prose.title, text: prose.text, dataText: prose.dataText, source: prose.source,
    subject: prose.subject, tier: prose.tier, priceWord: prose.priceWord ?? null,
    days, reward,
    ...(kind === 'slay' || kind === 'hunt' ? { combat: { monster: monster.cfa, required: 3, defeated: [] } } : {}),
  };
}

/**
 * The offer board of one settlement.
 *
 * Deterministic in `(world, library, seed, giver, day, dungeons)`: the same town on
 * the same day offers the same three jobs, which is what makes a board feel like a
 * place rather than a slot machine — and what lets a test name an offer.
 *
 * @param {object} opts  as `generateQuest`, plus `count`
 * @param {number} [opts.count]
 * @returns {RadiantQuest[]}
 */
export function buildBoard(opts) {
  const { world, library, seed, giver, day = 1, dungeons = [], tables = DEFAULT_TABLES, count = OFFERS_PER_BOARD } = opts;
  /** @type {RadiantQuest[]} */
  const offers = [];
  const usedKinds = new Set();
  for (let i = 0; i < count; i++) {
    // One job of each flavour where the data allows it: a board that offers three
    // identical errands is not a board.
    const spec = RADIANT_KINDS[(seed + i * 3) % RADIANT_KINDS.length];
    const kind = (spec.needsDungeon && !dungeons.length) || usedKinds.has(spec.id)
      ? RADIANT_KINDS.find((k) => !usedKinds.has(k.id) && (!k.needsDungeon || dungeons.length))?.id ?? 'deliver'
      : spec.id;
    if (usedKinds.has(kind)) continue;
    usedKinds.add(kind);
    try {
      offers.push(generateQuest({ world, library, kind, seed: (seed + i * 7919) >>> 0, giver, day, dungeons, tables }));
    } catch {
      // A kind the install cannot support is simply not on the board.
    }
  }
  return offers;
}

/**
 * The job one person in a settlement has to offer.
 *
 * Arena's side work reaches the player through *somebody* — a tavern keeper, a
 * guildmaster, a stranger with a problem — and this project's board is the world map's
 * version of that. This is the street's version: whoever the player speaks to in a
 * settlement answers with a job drawn from the same world, aimed at a dungeon the install
 * can really open.
 *
 * Deterministic in **the person's own cell and the settlement's seed**, which is the
 * whole safety net: the same stranger always has the same work, a second visit does not
 * reroll them, and a test can name the offer. Two people with the same job are possible
 * (there are five kinds and 613 talk ids, not 613 jobs) — what matters is that nobody's
 * offer changes under the player's feet.
 *
 * ## Who gave it
 *
 * The offer carries the **person** as well as the settlement (`giverId`, `giverPerson`),
 * and that is what makes a job a favour rather than a posting: the reward is paid by the
 * person who asked (`applyRadiantEvent`'s `return`), talking to them is how it is handed
 * in, and doing it is what moves their regard (`game/regard.js`). The id is the same
 * place-and-cell key the regard ledger uses, so the man who asked for the work is the man
 * who remembers it was done.
 * *
 * @param {object} opts
 * @param {import('./worldMap.js').WorldMap} opts.world
 * @param {import('../arena/arenaText.js').ArenaLibrary} opts.library
 * @param {object} opts.giver      the settlement the person stands in
 * @param {{place: {row: number, col: number}}} opts.person  how a person is addressed here
 * @param {number} [opts.day]
 * @param {number} [opts.round]  how many of this person's jobs are already finished; each
 *   round is a new draw, which is how a friend keeps having work to offer
 * @param {object[]} [opts.dungeons]  the enterable dungeons (see `enterableDungeons`)
 * @param {RadiantTables} [opts.tables]
 * @returns {RadiantQuest|null} null when this person has nothing to offer
 */
export function personOffer(opts) {
  const { world, library, giver, person, day = 1, round = 0, dungeons = [], tables = DEFAULT_TABLES } = opts;
  if (!world || !library || !giver || !person?.place) return null;
  // **The cell they were placed on** (`home`), never the one they happen to be standing on:
  // the town's people walk, and a stranger who steps next door mid-conversation must hand
  // back the same job, keyed to the same person, as the one the panel was selling (the
  // browser suite caught exactly this when the cache was keyed by the standing cell).
  const cell = person.home ?? person.place;
  const seed = ((((giver.citySeed ?? 0) >>> 0) * 31)
    + (Number(cell.row) || 0) * 7919
    + (Number(cell.col) || 0) * 131
    // **A finished job asks for another.** The round is part of the draw, so the same
    // person offers a new job after each payment and still offers the *same* one on every
    // visit until it is done (the save only has to remember the count).
    + Math.max(0, Math.trunc(Number(round) || 0)) * 104729 + 7) >>> 0;
  // A kind whose subject the install cannot open is not offered to anybody: the same rule
  // `buildBoard` applies, for the same reason — a job that names a place the game cannot
  // enter is worse than no job.
  const kinds = RADIANT_KINDS.filter((k) => !k.needsDungeon || dungeons.length);
  if (!kinds.length) return null;
  const kind = kinds[seed % kinds.length];
  try {
    const offer = generateQuest({ world, library, kind: kind.id, seed, giver, day, dungeons, tables });
    // Who is asking, in the two forms the game needs: the id the regard ledger is keyed by
    // and the phrase the panel and the journal show the player. `home` is the cell they
    // were *placed* on — the cell they walk from, not the one they were standing on when
    // the conversation began, which is what keeps the id (and so the job) the same on
    // every visit to the town.
    const giverId = personId(giver.name, cell);
    return {
      ...offer,
      giverId,
      giverPerson: typeof person.description === 'string' ? person.description : null,
      giverArmour: typeof person.armour === 'string' ? person.armour : null,
    };
  } catch (err) {
    console.warn('[radiant] no offer for', person?.description, '-', err?.message ?? err);
    return null;
  }
}

/**
 * The completed job **this person** is waiting to pay for, or null.
 *
 * The mirror of `handInAtPlace`, and the reason both exist: a job's reward is owed by
 * whoever gave it. A job a person handed over is paid by that person and by nobody else
 * (`applyRadiantEvent`'s `return` checks the same id); a job off the world map's board has
 * no person behind it and is the town's.
 *
 * @param {RadiantState} state
 * @param {string|null} personId  `game/regard.js`'s key for a person
 * @returns {RadiantQuest|null}
 */
export function handInWith(state, personId) {
  const active = state?.active;
  if (!active?.completed || !active.giverId || !personId) return null;
  return active.giverId === personId ? active : null;
}

/**
 * The completed job a **town** owes for, or null.
 *
 * Only a job with no person behind it — one posted on the world map's board — belongs to
 * the settlement it was taken in, so a player who finished a stranger's errand is not paid
 * by the first town they walk into.
 *
 * @param {RadiantState} state
 * @param {string|null} where  the settlement the player is standing in
 * @returns {RadiantQuest|null}
 */
export function handInAtPlace(state, where) {
  const active = state?.active;
  if (!active?.completed || active.giverId) return null;
  const name = typeof where === 'string' ? where.trim().toLowerCase() : '';
  return name && active.giver.toLowerCase() === name ? active : null;
}

/**
 * Does an offer read as a whole sentence once it has been filled?
 *
 * Arena's artifact banks are multi-sentence paragraphs, and this project can fill the words
 * that name **things it has** — the speaker, the artifact, the place, the land, the price —
 * and cannot fill the ones that name things it has not (`%tn`, `%pcf`, `%ct` are forms of
 * address and idiom whose meaning lives in `A.EXE`). `fillTemplate` *drops* a word it is not
 * given and tidies the punctuation behind it, which is where the danger is: a dropped word
 * leaves a sentence that looks whole and is not — "Everything I know about finding the bow
 * can be bought for 550 gold pieces" is fine, but "I'll tell you where to go, `%pcf`"
 * becomes "I'll tell you where to go," and a preposition that wanted a noun becomes "to,".
 *
 * So an offer is *eligible* only if it survives being filled: no `%` word left, no preposition
 * left before a comma or a stop, no double space, no space before punctuation. The pool is
 * large (372 offers in this install, several per artifact) so refusing the ones that cannot be
 * said costs nothing a player can notice, and it is the same rule `game/townsfolk.js` already
 * applies to the talk corpus: a line is shown only when it is whole.
 *
 * @param {string} text  a *filled* offer
 * @returns {boolean}
 */
export function offerReadsWhole(text) {
  const filled = String(text ?? '').replace(/[ \t]+/g, ' ');
  if (filled.length < 40) return false;
  // A word with nothing to fill it.
  if (/%[a-z0-9]{1,4}\b/i.test(filled)) return false;
  // A preposition or article that lost its noun.
  if (/\b(?:the|a|an|of|to|in|for|with|from|at|on|by|about|that|your|my)\s*[,.;:!?]/i.test(filled)) return false;
  if (/\s[,.;:!?]/.test(filled)) return false;
  if (/[,;:]\s*[.]/.test(filled)) return false;
  if (/\s{2,}/.test(filled)) return false;
  return true;
}

/**
 * The `%`-words the artifact banks use, filled in for one player in one place.
 *
 * The banks' vocabulary is wide (`%a`, `%adn`, `%amn`, `%bа`, …) and every word is
 * an offer's own business: the ones covered here are the ones that carry meaning to
 * a player — who is speaking, what they look like to the speaker, what it costs, and
 * where they are. Anything else is dropped by `fillTemplate`, which tidies the
 * punctuation behind it.
 *
 * **The two that were dropped and should not have been.** `%amn` is the *place* a speech
 * is selling — "The place is called the `%amn`, and I will inscribe it onto your map" —
 * and it appears in **36** of the banks' offers; with nothing to fill it, the sentence
 * reached the player as "The place is called the,". `%lp` is the speaker's own land ("his
 * thick `%lp` accent"), and the speaker is standing in the town the job is given in, so
 * that province is the honest fill. Both are names the game already has.
 *
 * `%cn`/`%cn2` are the **speaker's** country and its neighbour, not the target's: the
 * banks' lines read "The Necromancers of `%cn` have been offering me thousands of gold",
 * which is where the speaker lives — it was filled with the *target's* province, so a job
 * in another province had a speech claiming its villainy was local.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {object} giver
 * @param {number} seed
 * @param {{name: string}} chosen
 * @param {object} target
 */
function artifactValues(world, giver, seed, chosen, target) {
  const speaker = giverRulerName(world, giver, seed);
  const price = 100 + (chosen.tier ?? 2) * 150;
  return {
    an: speaker, n: speaker, an2: speaker,
    ra: 'adventurer',
    oap: price, nap: Math.round(price / 2),
    g: price, g2: Math.round(price / 2), g3: Math.round(price / 4),
    i: chosen.name, mt: chosen.name,
    // The place the speech is selling, and the land the one selling it is standing in.
    amn: target.name,
    lp: giver.province ?? target.province,
    cn: giver.province ?? target.province, cn2: target.province,
    // `%nt` is the place the speaker will be found in, and the banks use it two ways: bare
    // ("back in %nt already", "I'll be at %nt for three more days") and behind an article
    // ("in the shadows of the %nt"). The town's own name fills the first and cannot fill the
    // second — "into the Daggerfall" is not a sentence — so `ntIsTheTown` below drops the
    // templates of the second form rather than putting a wrong word in them.
    nt: giver.name ?? 'the tavern', t: 'tavern',
    u: 'gold', st: 'gold', r: 'the road',
  };
}

/** A ruler's name for a settlement: Arena derives rulers from the province seed,
 * and `template.dat`'s `%an` wants a person. Derived here rather than invented, so
 * the same city always has the same speaker. */
function giverRulerName(world, giver, seed) {
  const random = new ArenaRandom(((seed >>> 0) ^ (giver.citySeed >>> 0)) >>> 0);
  const first = ['Varnis', 'Cael', 'Doryn', 'Hessa', 'Ilmen', 'Kael', 'Mora', 'Rian', 'Sela', 'Taren'];
  const last = ['of the Reach', 'the Elder', 'the Younger', 'of the Isles', 'the Grey', 'the Bold'];
  return `${first[random.nextBelow(first.length)]} ${last[random.nextBelow(last.length)]}`;
}

/**
 * @typedef {object} RadiantState
 * @property {RadiantQuest[]} offers    the board as it was when last read
 * @property {RadiantQuest|null} active the accepted job
 * @property {number} taken             jobs finished
 * @property {number} failed            jobs that ran out of days
 * @property {number} gold              gold earned from radiant work
 * @property {string[]} log             the side journal, newest last
 * @property {number} day               the in-world day
 * @property {Record<string, number>} people  finished jobs per person id (`regard.js`), so the
 *   next conversation draws a *new* job instead of handing the same one back
 */

/**
 * A fresh radiant state.
 * @returns {RadiantState}
 */
export function createRadiantState() {
  return { offers: [], active: null, taken: 0, failed: 0, gold: 0, log: [], day: 1, people: {} };
}

/**
 * Is the player at the wild job's own spot?
 *
 * A country target is a **cell**, not a name: the player can be on the same 128-cell page
 * and still be a hundred paces from the camp, so the cell is what the event checks when the
 * caller can supply the player's own (`ctx.cell`, `scenes/interior.js`'s `worldCellNow`).
 * A caller with no cell (a unit test, the world map) falls back to the target's name.
 */
function atTarget(active, where, ctx = {}) {
  if (active?.targetKind === 'wild') {
    const pc = ctx.cell;
    if (pc && Number.isFinite(Number(pc.row)) && Number.isFinite(Number(pc.col))
      && active.targetCell) {
      // A camp is a place, not a pixel: the standable floor nearest a world pixel's centre
      // can be a few cells off it (`scenes/interior.js`'s `standableNear`), and a hunter
      // chases the quarry around the fire. Twelve cells is the camp's own clearing.
      return Math.max(Math.abs(Number(pc.row) - active.targetCell.row),
        Math.abs(Number(pc.col) - active.targetCell.col)) <= 12;
    }
    return Boolean(where) && where.toLowerCase() === active.target.toLowerCase();
  }
  return Boolean(where) && where.toLowerCase() === active.target.toLowerCase();
}

/** The events the radiant machine understands. */
export const RADIANT_EVENTS = Object.freeze(['accept', 'arrive', 'found', 'killed', 'rescue', 'deliver', 'return', 'abandon']);

/**
 * Apply one radiant event.
 *
 * The sequence is deliberately the same shape as the main quest's: an objective is
 * only satisfiable at its own target, and a job is only paid at its own giver —
 * so a scripted run cannot "complete" a job by firing events from anywhere.
 *
 * @param {RadiantState} state
 * @param {string} event
 * @param {{offer?: RadiantQuest, where?: string, cell?: {row:number,col:number}, days?: number}} [ctx]
 * @returns {{ok: boolean, reason?: string, state: RadiantState, gold?: number}}
 */
export function applyRadiantEvent(state, event, ctx = {}) {
  const next = { ...state, log: [...state.log] };
  const active = state.active;
  const where = ctx.where ?? null;

  /** @returns {{ok:false, reason:string, state:RadiantState}} */
  const refuse = (reason) => ({ ok: false, reason, state });

  switch (event) {
    case 'accept': {
      const offer = ctx.offer ?? null;
      if (!offer) return refuse('no offer was named');
      if (active) return refuse(`"${active.title}" is still unfinished`);
      const progress = slayProgress(offer);
      if ((offer.kind === 'slay' || offer.kind === 'hunt') && !progress) return refuse('this bounty names no known creature');
      next.active = { ...offer, completed: false,
        ...(progress ? { combat: { ...offer.combat, ...progress, defeated: [] } } : {}) };
      next.offers = state.offers.filter((o) => o.id !== offer.id);
      next.log.push(`Accepted: ${offer.title} (${offer.reward} gold, ${offer.days} days).`);
      return { ok: true, state: next };
    }
    case 'arrive': {
      if (!active) return refuse('no job is in hand');
      if (!atTarget(active, where, ctx)) {
        return refuse(`"${active.title}" is at ${active.target}${where ? `, not ${where}` : ''}`);
      }
      next.log.push(`Reached ${active.target}.`);
      return { ok: true, state: next };
    }
    case 'found':
    case 'killed':
    case 'rescue':
    case 'deliver': {
      if (!active) return refuse('no job is in hand');
      const wanted = active.kind === 'rescue' ? 'rescue' : active.kind === 'deliver' ? 'deliver'
        : active.kind === 'slay' || active.kind === 'hunt' ? 'killed' : 'found';
      if (event !== wanted) return refuse(`"${active.title}" is not finished by ${event}`);
      if (!atTarget(active, where, ctx)) {
        return refuse(`that has to happen at ${active.target}`);
      }
      if (active.completed) return refuse('this job is already finished');
      if (event === 'killed') {
        const progress = slayProgress(active);
        if (!progress || ctx.questId !== active.id || ctx.monster !== progress.monster
          || !progress.ids.includes(ctx.encounterId)) return refuse('defeat the contracted creatures in their lair');
        if (progress.defeated.includes(ctx.encounterId)) return refuse('that creature was already counted');
        const defeated = [...progress.defeated, ctx.encounterId];
        next.active = { ...active, combat: { ...progress, defeated }, completed: defeated.length >= progress.required };
        next.log.push(`Hunt: ${defeated.length}/${progress.required} ${active.subject} defeated at ${active.target}.`);
        if (!next.active.completed) return { ok: true, state: next };
      } else next.active = { ...active, completed: true };
      next.log.push(`${active.kind === 'slay' ? 'Cleared' : active.kind === 'hunt' ? 'Hunted' : active.kind === 'rescue' ? 'Rescued' : 'Recovered'}: ${active.subject} at ${active.target}. Return to ${active.giver}.`);
      return { ok: true, state: next };
    }
    case 'return': {
      if (!active) return refuse('no job is in hand');
      if (!active.completed) return refuse(`"${active.title}" is not finished yet`);
      if (!where || where.toLowerCase() !== active.giver.toLowerCase()) {
        return refuse(`the reward waits in ${active.giver}`);
      }
      // A job that came from a **person** is paid by that person: standing in their town
      // is not enough, and the caller says who it is standing in front of (`ctx.personId`,
      // out of `game/regard.js`). Without that, the whole point of work being *given* — that
      // you go back and the one who asked remembers it — would be lost.
      if (active.giverId && ctx.personId !== active.giverId) {
        return refuse(`the reward waits with ${active.giverPerson ?? 'the one who asked'}`);
      }
      next.active = null;
      next.taken = state.taken + 1;
      next.gold = state.gold + active.reward;
      next.log.push(`Completed: ${active.title}. ${active.reward} gold`
        + `${active.giverPerson ? ` from ${active.giverPerson} in ${active.giver}` : ''}.`);
      return { ok: true, state: next, gold: active.reward };
    }
    case 'abandon': {
      if (!active) return refuse('no job is in hand');
      next.active = null;
      next.log.push(`Abandoned: ${active.title}.`);
      return { ok: true, state: next };
    }
    default:
      return refuse(`unknown radiant event "${event}"`);
  }
}

/**
 * Let in-world days pass, failing a job whose deadline has come.
 *
 * @param {RadiantState} state
 * @param {number} days
 * @returns {RadiantState}
 */
export function advanceDays(state, days) {
  const next = { ...state, log: [...state.log], day: state.day + Math.max(0, days) };
  if (next.active && next.day - next.active.offeredOn > next.active.days) {
    next.log.push(`Failed: ${next.active.title} — the ${next.active.days} days ran out.`);
    next.failed++;
    next.active = null;
  }
  return next;
}

/** The active job's objective in one line, for the HUD and the journal. */
export function radiantObjective(state) {
  const active = state.active;
  if (!active) return null;
  if (!active.completed) {
    const progress = slayProgress(active);
    const hunt = progress ? ` Defeat ${active.subject}: ${progress.defeated.length}/${progress.required}.` : '';
    // **The last leg is on foot.** A country job is not a fast travel destination: the player
    // arrives at its anchor (a town, village or dungeon) and walks out, so the line says how
    // far that walk is rather than letting the map promise a door onto the camp.
    const walk = active.targetKind === 'wild' && active.targetAnchor
      ? ` ${active.targetWalk ?? ''} paces out of ${active.targetAnchor}, on foot.`.replace(/^\s+/, ' ')
      : '';
    return `${active.kind === 'deliver' ? 'Deliver to' : 'Travel to'} ${active.target} — ${active.title}.${walk}${hunt}`;
  }
  // *Who* pays, by name of what they are rather than of who they are (Arena's people have
  // no names in this install — S30): the person who asked, when the job came from one.
  const from = active.giverPerson ? `${active.giverPerson} in ${active.giver}` : active.giver;
  return `Return to ${from} for ${active.reward} gold.`;
}

/**
 * Everything a quest-log window shows about the side work.
 * @param {RadiantState} state
 */
export function radiantLog(state) {
  return {
    offers: state.offers.map((o) => ({ id: o.id, kind: o.kind, title: o.title, target: o.target, days: o.days, reward: o.reward })),
    active: state.active
      ? {
        id: state.active.id,
        kind: state.active.kind,
        title: state.active.title,
        target: state.active.target,
        targetMif: state.active.targetMif,
        targetKind: state.active.targetKind ?? (state.active.targetMif ? 'dungeon' : 'settlement'),
        targetCell: state.active.targetCell ?? null,
        targetAnchor: state.active.targetAnchor ?? null,
        giver: state.active.giver,
        giverId: state.active.giverId ?? null,
        giverPerson: state.active.giverPerson ?? null,
        subject: state.active.subject,
        reward: state.active.reward,
        days: state.active.days,
        daysLeft: Math.max(0, state.active.days - (state.day - state.active.offeredOn)),
        completed: Boolean(state.active.completed),
        combat: slayProgress(state.active),
      }
      : null,
    objective: radiantObjective(state),
    taken: state.taken,
    failed: state.failed,
    gold: state.gold,
    day: state.day,
    entries: state.log,
  };
}

/** A save-file-safe copy. */
export function serializeRadiantState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Restore a saved radiant state, tolerating a missing or partial one.
 *
 * @param {unknown} saved
 * @returns {RadiantState}
 */
export function deserializeRadiantState(saved) {
  const fresh = createRadiantState();
  if (!saved || typeof saved !== 'object') return fresh;
  const source = /** @type {Partial<RadiantState>} */ (saved);
  return {
    offers: Array.isArray(source.offers) ? source.offers.filter(Boolean).map((o) => ({ ...o })) : fresh.offers,
    active: source.active && typeof source.active === 'object' ? { ...source.active } : fresh.active,
    taken: Number.isFinite(source.taken) ? Number(source.taken) : fresh.taken,
    failed: Number.isFinite(source.failed) ? Number(source.failed) : fresh.failed,
    gold: Number.isFinite(source.gold) ? Number(source.gold) : fresh.gold,
    log: Array.isArray(source.log) ? source.log.map(String) : fresh.log,
    day: Number.isFinite(source.day) ? Number(source.day) : fresh.day,
    people: source.people && typeof source.people === 'object' && !Array.isArray(source.people)
      ? Object.fromEntries(Object.entries(source.people)
        .filter(([id, round]) => typeof id === 'string' && id && Number.isFinite(Number(round)))
        .map(([id, round]) => [id, Math.max(0, Math.trunc(Number(round))) ]))
      : fresh.people,
  };
}
