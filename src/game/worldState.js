// THE WORLD THE PLAYER HAS CHANGED — one record, one version, one round trip.
//
// Every scene of this port is really a page load (`game/save.js`): the world map is one page,
// a city is another, a dungeon is a third. What `save.js` keeps today is *the player's own
// progress* — who they are, the quest, the side work, the regard ledger, the emptied loot —
// each in its own key, each read and written by whichever scene happens to know about it. That
// is enough for progress and not enough for a **world**: a door the player opened is shut again
// on the next page load, a city they cleared is a city they never saw, and there is nowhere at
// all to say "this place was visited on day 37".
//
// This module is that `somewhere`. It owns one plain-JSON object — the world state — and the
// named operations that change it, so a city, a dungeon, a street and the map all write the
// same record through the same functions rather than each keeping its own private copy of the
// rules. `save.js` carries it (the coordinator wires `perfectarena.world` beside the other
// keys); this module never touches `localStorage`, the DOM or the filesystem, which is what
// makes every rule below a unit test rather than a promise.
//
// ## What is in it, and what each key is for
//
//   `visited`  one record per place the player has stood in: how many times, the first and
//              last of the world's days they were there, and the caller's own note
//   `doors`    per place, per cell: a door the player opened **stays open**. This is the one
//              that makes a city a place rather than a backdrop — the front door they forced
//              in Daggerfall is still open when they walk back down that street
//   `loot`     per place, per cell: a thing taken is gone for good (`save.js`'s day-based
//              restock is a *different* rule and stays where it is; this is the permanent one)
//   `kills`    per place, per monster id: how many of that thing the player has put down here
//   `regard`   the standings the world remembers, by `regard.js`'s own id (`Daggerfall#12,7`)
//   `quests`   one slot per quest id: the main chain's stage, a radiant job's own record
//   `clock`    the world's own day and minute, so the calendar survives the page load
//   `weather`  what the sky was doing, so a reload does not change the weather
//   `player`   the scene's own last known position, for a scene that wants to put the player
//              back where they were
//
// The three loose ones (`clock`, `weather`, `player`) are plain fields a caller sets directly
// — they have no invariants worth a function, and inventing setters for them would be four
// more names to keep in step. Every other key is changed through the functions below and
// nowhere else.
//
// ## Bounded on purpose
//
// A world that is played for a long time must not grow a save without limit. Every collection
// here has a cap (`WORLD_PLACE_MAX`, `WORLD_ENTRY_MAX`, `WORLD_PEOPLE_MAX`, `WORLD_QUEST_MAX`)
// and drops its **oldest** entry when it goes over, because a plain object keeps insertion
// order and "the door opened longest ago" is the entry a player is least likely to walk back
// through. The caps are the port's own numbers and say so.
//
// ## It cannot throw, and it cannot lose what it understands
//
// `parseWorld` is handed whatever was in the save: an older version, a truncated object, a
// string, `null`, an array, a version from a future build. It answers a **valid world state**
// every time — data it does not understand is dropped, data it does understand is kept — so a
// corrupt save is a fresh world rather than a scene that will not boot.

/** The shape of the record this module writes. A future version may add fields; this is v1. */
export const WORLD_STATE_VERSION = 1;
/** The most places remembered. A long game visits a few hundred; the oldest leave first. */
export const WORLD_PLACE_MAX = 2048;
/** The most entries per place per kind (doors, loot, kills). One city is at most a few hundred. */
export const WORLD_ENTRY_MAX = 4096;
/** The most people whose standing is remembered — `regard.js`'s own `PEOPLE_MAX`. */
export const WORLD_PEOPLE_MAX = 300;
/** The most quests remembered. The chain has eleven stages and a handful of jobs in hand. */
export const WORLD_QUEST_MAX = 512;

/** The standings `setRegard` accepts, and the only three `regard` ever holds. */
export const STANDINGS = Object.freeze(['friendly', 'neutral', 'hostile']);

/**
 * A fresh world: nothing visited, nothing opened, nobody who has heard of the player.
 *
 * @returns {object} the world state
 */
export function createWorldState() {
  return {
    version: WORLD_STATE_VERSION,
    visited: {},
    doors: {},
    loot: {},
    kills: {},
    regard: {},
    quests: {},
    clock: null,
    weather: null,
    player: null,
  };
}

/**
 * A cell as a key: `"12,7"`.
 *
 * A caller may hold a cell as `{row, col}` or as the pair the door and loot lists already use
 * (`"row,col"`), and both have to mean the same entry — a door opened through one spelling and
 * read back through the other would be the whole feature wearing a different hat.
 *
 * @param {{row?: number, col?: number}|string|Array<number>|null|undefined} cell
 * @returns {string|null} e.g. `12,7`, or null when the cell is not a cell
 */
function cellKeyOf(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'string') {
    const match = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(cell);
    return match ? `${Number(match[1])},${Number(match[2])}` : null;
  }
  if (Array.isArray(cell)) return cellKeyOf({ row: cell[0], col: cell[1] });
  if (typeof cell === 'object') {
    const row = Number(cell.row);
    const col = Number(cell.col);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
    return `${Math.trunc(row)},${Math.trunc(col)}`;
  }
  return null;
}

/**
 * A place's key, as a string. Anything else is `""`, which is a place of its own rather than an
 * error: a scene that does not know where it is still gets a record instead of a crash.
 *
 * @param {unknown} key
 * @returns {string}
 */
function placeKeyOf(key) {
  return typeof key === 'string' ? key : String(key ?? '');
}

/**
 * A day number, or null when the caller does not have one.
 *
 * The null guard is the load-bearing line: `Number(null)` is `0`, which is finite, so a save
 * whose `lastDay` is null would come back as the world's day zero — a visit on a day that has
 * not happened, and a first day that is never overwritten.
 */
function dayOf(value) {
  if (value === null || value === undefined || value === '') return null;
  const day = Number(value);
  return Number.isFinite(day) ? day : null;
}

/** Is this a record — a plain object rather than an array, a string or nothing? */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Keep one collection inside its cap by dropping the **oldest** keys.
 *
 * Insertion order is the age order in a plain object, so the entries past the cap are the ones
 * inserted first, and deleting them is dropping the oldest. Called after every insert rather
 * than on save, so a long session never holds more than the cap either.
 *
 * @param {Record<string, unknown>} map
 * @param {number} max
 */
function trim(map, max) {
  // `for…in` rather than `Object.keys`: the count is wanted on every insert, and a map at its
  // cap is thousands of strings — counting in place does not allocate them.
  let size = 0;
  for (const key in map) size++;
  let drop = size - max;
  if (drop <= 0) return;
  // The first keys in iteration order are the oldest: they go. (This used to keep the first
  // `max` and delete the rest, so a full map forgot the entry just written — the newest door
  // the player had opened, and the newest kill, the moment the cap was reached.)
  for (const key in map) {
    if (drop-- <= 0) break;
    delete map[key];
  }
}

/** The per-kind map of a place, created on demand. */
function placeMap(world, kind, placeKey) {
  const place = placeKeyOf(placeKey);
  const bucket = world[kind];
  if (!bucket[place] || typeof bucket[place] !== 'object') bucket[place] = {};
  // The place registry is trimmed from the kind's own map, which is the same order: a place
  // whose last door has been forgotten is a place this world no longer knows about.
  trim(bucket, WORLD_PLACE_MAX);
  const map = bucket[place];
  trim(map, WORLD_ENTRY_MAX);
  return map;
}

/**
 * Remember that the player stood somewhere.
 *
 * `firstDay` and `lastDay` are the world's own days (the caller's clock — see
 * `livingWorld.timeOfDay`), and both are null when the caller has no day to give: the count is
 * what is always known. A place is never removed once visited short of the cap, and a second
 * visit on the same day still counts, because "standing in Daggerfall twice" is a fact about
 * the player and not about the calendar.
 *
 * @param {object} world
 * @param {string} key      e.g. `city:Daggerfall`, `dungeon:Stonekeep`, `START.MIF#0`
 * @param {string|null} [note]  the caller's own word for the place (`a city`, `the way out`)
 * @param {number|null} [day]   the world's day, when the caller knows it
 * @returns {{key: string, note: string|null, count: number, firstDay: number|null, lastDay: number|null}}
 */
export function visitPlace(world, key, note = null, day = null) {
  const place = placeKeyOf(key);
  const at = dayOf(day);
  const existing = world.visited[place];
  const record = existing && typeof existing === 'object' ? existing : null;
  const next = record ?? { key: place, note: null, count: 0, firstDay: null, lastDay: null };
  next.key = place;
  next.count = Math.max(0, Math.trunc(Number(next.count) || 0)) + 1;
  if (typeof note === 'string' && note) next.note = note;
  if (at !== null) {
    if (next.firstDay === null || next.firstDay === undefined) next.firstDay = at;
    next.lastDay = at;
  }
  world.visited[place] = next;
  trim(world.visited, WORLD_PLACE_MAX);
  return next;
}

/**
 * Remember a door's state, so a door the player opened is still open next visit.
 *
 * The state is three facts and nothing else — whether it stands open, whether it is locked, and
 * how hard the lock is (`game/doors.js`'s own lock level, so a door the player forced open does
 * not come back sealed). Values are coerced rather than trusted: a scene that hands in
 * `open: 1` means open, and one that hands in garbage gets a shut, unlocked door.
 *
 * @param {object} world
 * @param {string} placeKey
 * @param {{row?: number, col?: number}|string|Array<number>} cellKey
 * @param {{open?: boolean, locked?: boolean, lockLevel?: number}} state
 * @returns {{open: boolean, locked: boolean, lockLevel: number}|null} what was stored
 */
export function setDoorState(world, placeKey, cellKey, state) {
  const cell = cellKeyOf(cellKey);
  if (!cell) return null;
  const map = placeMap(world, 'doors', placeKey);
  const lockLevel = Math.max(0, Math.trunc(Number(state?.lockLevel) || 0));
  const record = {
    open: Boolean(state?.open),
    locked: Boolean(state?.locked),
    lockLevel,
  };
  map[cell] = record;
  trim(map, WORLD_ENTRY_MAX);
  return record;
}

/**
 * What is known about one door, or null when this world has never opened or shut it.
 *
 * A copy rather than the stored record: a caller that wrote through the answer would be editing
 * the world state without going through `setDoorState`, and the caps would stop being the whole
 * story.
 *
 * @param {object} world
 * @param {string} placeKey
 * @param {{row?: number, col?: number}|string|Array<number>} cellKey
 * @returns {{open: boolean, locked: boolean, lockLevel: number}|null}
 */
export function doorStateAt(world, placeKey, cellKey) {
  const cell = cellKeyOf(cellKey);
  if (!cell) return null;
  const record = world.doors?.[placeKeyOf(placeKey)]?.[cell];
  if (!record || typeof record !== 'object') return null;
  return {
    open: Boolean(record.open),
    locked: Boolean(record.locked),
    lockLevel: Math.max(0, Math.trunc(Number(record.lockLevel) || 0)),
  };
}

/**
 * Take something off the floor, for good.
 *
 * Answers **false** when this world has already taken it, which is the whole point of the
 * function: a scene calls it, and a `false` means the thing is not there — the second player
 * through the same chest finds it empty rather than restocking it by accident. The killer does
 * not need the day: `save.js`'s loot record is the *restocking* rule and this is the permanent
 * one, and the two are read together by the scene.
 *
 * @param {object} world
 * @param {string} placeKey
 * @param {{row?: number, col?: number}|string|Array<number>} cellKey
 * @param {string} name  what was taken, e.g. `a mithril key`
 * @returns {boolean} true when this call took it, false when it was already gone
 */
export function takeLoot(world, placeKey, cellKey, name) {
  const cell = cellKeyOf(cellKey);
  if (!cell) return false;
  const map = placeMap(world, 'loot', placeKey);
  if (map[cell]) return false;
  map[cell] = { name: typeof name === 'string' ? name : String(name ?? 'something') };
  trim(map, WORLD_ENTRY_MAX);
  return true;
}

/**
 * Is this cell's thing already gone?
 *
 * @param {object} world
 * @param {string} placeKey
 * @param {{row?: number, col?: number}|string|Array<number>} cellKey
 * @returns {boolean}
 */
export function lootTakenAt(world, placeKey, cellKey) {
  const cell = cellKeyOf(cellKey);
  if (!cell) return false;
  return Boolean(world.loot?.[placeKeyOf(placeKey)]?.[cell]);
}

/**
 * Count a kill, per place and per kind of creature.
 *
 * By `monsterId` rather than by cell, because two goblins in one dungeon are the same fact about
 * the world and a scene that cares (a bounty, a "this level is clear" line, the journal) wants
 * the number.
 *
 * @param {object} world
 * @param {string} placeKey
 * @param {string} monsterId
 * @returns {number} the new count in this place
 */
export function noteKill(world, placeKey, monsterId) {
  const map = placeMap(world, 'kills', placeKey);
  const id = typeof monsterId === 'string' && monsterId ? monsterId : 'something';
  const count = Math.max(0, Math.trunc(Number(map[id]) || 0)) + 1;
  map[id] = count;
  trim(map, WORLD_ENTRY_MAX);
  return count;
}

/**
 * Record a standing the world keeps: a friend, a stranger, or an enemy.
 *
 * The id is `regard.js`'s own (`Daggerfall#12,7` — a place and the cell a person was placed on),
 * and the standing is the coarse word its thresholds already read as. A standing nobody
 * recognises is stored as `neutral` rather than refused: the world is not the place to argue
 * about a caller's vocabulary, and a person whose standing cannot be read must not become an
 * enemy by accident.
 *
 * @param {object} world
 * @param {string} regardId
 * @param {string} standing  `friendly`, `neutral` or `hostile`
 * @returns {string} the standing that was stored
 */
export function setRegard(world, regardId, standing) {
  const id = typeof regardId === 'string' ? regardId : String(regardId ?? '');
  const word = STANDINGS.includes(standing) ? standing : 'neutral';
  world.regard[id] = { standing: word };
  trim(world.regard, WORLD_PEOPLE_MAX);
  return word;
}

/**
 * One quest's own record: the main chain's stage, or a job in hand.
 *
 * The state is stored as a **JSON-safe copy**, because this record's whole reason to exist is
 * that it rides a save: a caller handing in a live object with a method on it would produce a
 * save that cannot be read back, and the failure would show up a page load later, far from the
 * call. A state that cannot be copied is stored as null and said so in the record.
 *
 * @param {object} world
 * @param {string} id     e.g. `main`, `radiant:Daggerfall#3`
 * @param {unknown} state
 * @returns {{id: string, state: unknown}} the stored record
 */
export function setQuest(world, id, state) {
  const key = typeof id === 'string' && id ? id : String(id ?? '');
  const record = { id: key, state: jsonSafe(state) };
  world.quests[key] = record;
  trim(world.quests, WORLD_QUEST_MAX);
  return record;
}

/**
 * A JSON-safe copy of anything, or null when there is no such copy.
 *
 * `JSON.parse(JSON.stringify(x))` is the whole of it, with the throw caught: a cycle, a
 * `BigInt`, a function — each of those is a value a quest state should never hold, and each of
 * them would otherwise take a save down with it.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function jsonSafe(value) {
  if (value === undefined) return null;
  try {
    const copy = JSON.parse(JSON.stringify(value));
    return copy === undefined ? null : copy;
  } catch {
    return null;
  }
}

/**
 * The world in small numbers, for a HUD line, a journal header or a test.
 *
 * Six numbers and the clock: how much world there is. Anything a caller wants beyond this reads
 * the state itself, which is plain data.
 *
 * @param {object} world
 * @returns {{places: number, doors: number, loot: number, kills: number, quests: number, people: number, clock: {day: number, minutes: number}|null}}
 */
export function worldSummary(world) {
  const countOf = (bucket) => Object.values(bucket ?? {})
    .reduce((total, map) => total + (map && typeof map === 'object' ? Object.keys(map).length : 0), 0);
  const clock = world?.clock && typeof world.clock === 'object' ? world.clock : null;
  const day = dayOf(clock?.day);
  return {
    places: Object.keys(world?.visited ?? {}).length,
    doors: countOf(world?.doors),
    loot: countOf(world?.loot),
    // Kills are **counted, not kinds**: the world's own tally is how many creatures the player
    // has put down, and the per-kind map is what a caller reads for detail.
    kills: Object.values(world?.kills ?? {})
      .reduce((total, map) => total + (map && typeof map === 'object'
        ? Object.values(map).reduce((n, value) => n + Math.max(0, Math.trunc(Number(value) || 0)), 0)
        : 0), 0),
    quests: Object.keys(world?.quests ?? {}).length,
    people: Object.keys(world?.regard ?? {}).length,
    clock: clock && day !== null ? { day, minutes: Math.max(0, Math.trunc(Number(clock.minutes) || 0)) } : null,
  };
}

/**
 * The world as a plain object a save can write.
 *
 * A **deep copy through the normalisers** rather than a `JSON.stringify`: a state that has been
 * handed around a running scene may hold a live reference, a `Map`, or a number that is not a
 * number, and the save has to be the same shape whether it is written on the first day or the
 * hundredth. `parseWorld(serializeWorld(w))` is therefore an identity on everything the world
 * can hold, which is the round trip the unit test holds it to.
 *
 * @param {object} world
 * @returns {object} JSON-safe
 */
export function serializeWorld(world) {
  const out = createWorldState();
  const source = world && typeof world === 'object' ? world : {};
  for (const [key, record] of Object.entries(source.visited ?? {})) {
    if (!record || typeof record !== 'object') continue;
    const count = Math.max(1, Math.trunc(Number(record.count) || 1));
    out.visited[key] = {
      key,
      note: typeof record.note === 'string' ? record.note : null,
      count,
      firstDay: dayOf(record.firstDay),
      lastDay: dayOf(record.lastDay),
    };
  }
  for (const key of ['doors', 'loot', 'kills']) {
    for (const [place, map] of Object.entries(source[key] ?? {})) {
      if (!map || typeof map !== 'object') continue;
      for (const [cell, value] of Object.entries(map)) {
        if (value === null || value === undefined) continue;
        if (key === 'doors') {
          const state = typeof value === 'object' ? value : { open: Boolean(value) };
          setDoorState(out, place, cell, state);
        } else if (key === 'loot') {
          takeLoot(out, place, cell, typeof value === 'object' ? value.name : value);
        } else {
          // Written straight rather than counted up one call at a time: a save that says a
          // thousand creatures died here is one number, and a loop of a thousand `noteKill`s
          // would be a stall at load for no gain.
          const count = Math.max(1, Math.trunc(Number(typeof value === 'object' ? value.count : value) || 1));
          const killMap = placeMap(out, 'kills', place);
          killMap[cell] = count;
          trim(killMap, WORLD_ENTRY_MAX);
        }
      }
    }
  }
  for (const [id, record] of Object.entries(source.regard ?? {})) {
    const word = typeof record === 'string' ? record : record?.standing;
    setRegard(out, id, word);
  }
  for (const [id, record] of Object.entries(source.quests ?? {})) {
    setQuest(out, id, record && typeof record === 'object' && 'state' in record ? record.state : record);
  }
  out.clock = plainClock(source.clock);
  out.weather = isRecord(source.weather) ? jsonSafe(source.weather) : null;
  out.player = isRecord(source.player) ? jsonSafe(source.player) : null;
  return out;
}

/** A clock as `{day, minutes}`, or null. Anything else is "no clock has been saved". */
function plainClock(value) {
  if (!isRecord(value)) return null;
  const day = dayOf(value.day);
  const minutes = dayOf(value.minutes);
  if (day === null && minutes === null) return null;
  return { day: day ?? 1, minutes: Math.max(0, Math.trunc(minutes ?? 0)) };
}

/**
 * Read a saved world back, **whatever** was saved.
 *
 * This is the function a corrupt save meets, so it never throws and never answers a partial
 * world: `null`, a string, an array, a version from a future build and a truncated object all
 * come back as a valid state. It also never *loses* what it understands — a v1 save read by a
 * v2 build keeps its doors and its visits — which is why the version is checked rather than
 * switched on: a newer save's fields this build has never heard of are dropped, and the fields
 * it does know are kept.
 *
 * @param {unknown} value
 * @returns {object} a valid world state
 */
export function parseWorld(value) {
  const fresh = createWorldState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fresh;
  const source = /** @type {Record<string, unknown>} */ (value);
  const version = Number(source.version);
  // A future version is *read*, not refused: the fields this build understands keep their
  // meaning, and the ones it has never seen are the ones that would have been dropped anyway.
  const out = serializeWorld({
    version: Number.isFinite(version) && version >= 1 ? version : WORLD_STATE_VERSION,
    visited: source.visited,
    doors: source.doors,
    loot: source.loot,
    kills: source.kills,
    regard: source.regard,
    quests: source.quests,
    clock: source.clock,
    weather: source.weather,
    player: source.player,
  });
  out.version = WORLD_STATE_VERSION;
  return out;
}
