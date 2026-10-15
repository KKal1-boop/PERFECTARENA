// A DAY IN THE LIFE OF AN ARENA TOWN — THE CLOCK, THE SCHEDULE, AND THE WATCH.
//
// This is the twin project's living world (`daggerfall/src/systems/livingWorld/dayPlan.js`,
// `townPaths.js`, `systems/townWatch.js`, bible/06-Systems/Living-World.md) cut down to what
// Arena's own data can honestly support, and tailored to the port that reads that data.
//
//   * **The clock.** A settlement's people work by the hour: the smith opens in the morning
//     and is in the tavern by dark, the priest keeps the temple through the day, the watch
//     keeps its shifts, and a tavern pours late into the night. `timeOfDay` turns the level's
//     own seconds into an hour of the day and a phase of it.
//   * **The day.** `dayPlanFor` is one person's 24 hours — sleep, work, a meal, a drink, a
//     wander, home — drawn from *their own trade* and their own seed. Two people with the
//     same trade live different days and the same person lives the same day every time the
//     town is visited, which is the twin's own rule (a day is derived, never stored).
//   * **The door.** `streetGoal` answers which door a person is walking to: the shop they
//     keep, the tavern, the temple, their own home cell, or the beat their own seed gives
//     them. The scene walks them there; nothing here moves anybody.
//   * **The law.** `watchDecision` and `watchSpawn` are the twin's watch (`runTownWatchFrame`
//     and its `isTownThreat`/countdown) reduced to what a city street can do: a crime the
//     town *saw* brings the watch, and a crime nobody saw is nobody's business. The ledger
//     that pays for it is already the port's (`game/regard.js`).
//
// ## What is Arena's here, and what is this project's (S40)
//
// Arena has all of this and keeps every number of it inside `A.EXE` — which this data set
// does not ship (DECISIONS.md D11) — so, exactly as S32 says of a settlement's population:
//
//   * **The roster is the data's.** A person's *trade* is what the game recorded about them:
//     the shop they keep (`person.shop.kind`, from an interior's own `*MENU` slots and signs,
//     `game/shops.js`) or the role an `.INF` flat's `*ITEM` names (`game/dungeonItems.js`'s
//     person items — smith, bartender, priest, wizard, merchant, beggar, jester, musician,
//     harlot, fire-eater, snake charmer, vendor, shady character, knight). Nothing is
//     invented: a person with no recorded trade is a townsperson, and their day says so.
//   * **The hours, the shifts and the watch's numbers are this project's,** scaled to the
//     shapes the twin's law gives them: a keeper's day is centred on an opening hour, the
//     watch keeps three shifts that rotate a shift a day with a day off, and a murder brings
//     more watchmen than a theft. Every constant below that is not the twin's own number is
//     labelled in place.
//
// Like every other module in `game/`, this one is **pure**: no DOM, no `localStorage`, no
// scene, nothing that moves anybody. It answers questions; `scenes/interior.js` acts on the
// answers. That is what makes the whole thing testable without a browser, and what lets the
// same town be read by a test, a HUD line and a walk cycle without any of them disagreeing.

import { ArenaRandom } from './arenaRandom.js';
import { personId } from './regard.js';
import { DAWN_HOUR, DUSK_HOUR } from './daylight.js';

/** Hours in a day. Arena's day is the ordinary one. */
export const HOURS_PER_DAY = 24;
/** Minutes in a day: the unit every plan and every opening hour below is written in. */
export const MINUTES_PER_DAY = 1440;

/**
 * How fast the town's clock runs: **game minutes per real minute.**
 *
 * The twin's own default, verbatim (`daggerfall/src/engine/net/wire.js`: "TimeScale 12: a game
 * minute every five real seconds, a day every two hours"), which is Daggerfall Unity's default
 * `TimeScale`. It matters more than it looks: at one game minute a minute — what this module
 * divided by until now — a game day is twenty-four hours of play, so a player would never once
 * see an evening come, a smith shut his door, or the tavern fill up. The whole living world
 * below would only ever be visible at the hour the player happened to arrive.
 */
export const GAME_MINUTES_PER_REAL_MINUTE = 12;
/** Real seconds one game minute of the town's clock takes (`TimeScale 12` → five). */
export const SECONDS_PER_GAME_MINUTE = 60 / GAME_MINUTES_PER_REAL_MINUTE;
/** Seconds in a game day — the unit the scene's own `dbg.seconds` is counted in. */
export const SECONDS_PER_DAY = MINUTES_PER_DAY * SECONDS_PER_GAME_MINUTE;

/**
 * The scene seconds that put the clock at a given minute past midnight, **from a level's own
 * start**.
 *
 * The one conversion a caller needs: `timeOfDay` reads `dbg.seconds`, and a door that forced a
 * clock (the scene's `setClock`, and the `?clock=` parameter behind it) has to write the seconds
 * that *mean* that minute. Kept beside the rate so the two can never drift.
 *
 * @param {number} minutes
 * @returns {number}
 */
export function secondsForMinutes(minutes) {
  return (Number.isFinite(Number(minutes)) ? Number(minutes) : 0) * SECONDS_PER_GAME_MINUTE;
}

/**
 * The hour of the day a settlement's clock reads when a level is entered.
 *
 * **This project's number, and it matters.** The port's scene clock starts at zero the
 * moment the level is built, and the twin's day turns in the one dead hour of the night
 * (`DAY_START_MIN`, 04:00) so that no night is cut in half by the turn. Arena's own streets
 * are another matter: a player who arrives is usually arriving *to do something*, and a town
 * full of shut doors and sleeping people at ten past the hour is a town that looks broken.
 * So a day here opens at **six in the morning** and rolls on from there.
 */
export const DAY_OPENS_HOUR = 6;

/**
 * The phases of a day, by the hour it begins at, in order.
 *
 * The *names* are this project's; the boundaries are the ones the sky already uses
 * (`game/arenaSky.js` and the weather pass know dawn from dusk), so a phase here and the
 * light out there are the same morning.
 */
export const PHASES = Object.freeze([
  Object.freeze({ phase: 'deepnight', from: 0 }),
  // **The sun's own hours, not this module's guess at them.** `daylight.js` carries DFU's
  // `DawnHour 6` / `DuskHour 18` and is what actually lights the frame; a phase table that
  // said ``dusk`` at five in the afternoon would be a second clock contradicting the sky. Dawn
  // is the hour *before* sunrise (the sky is already light and the sun is not yet up), exactly
  // as DFU lights its lanterns an hour either side of the sun.
  Object.freeze({ phase: 'dawn', from: DAWN_HOUR - 1 }),
  Object.freeze({ phase: 'morning', from: DAWN_HOUR }),
  Object.freeze({ phase: 'midday', from: 11 }),
  Object.freeze({ phase: 'afternoon', from: 14 }),
  Object.freeze({ phase: 'dusk', from: DUSK_HOUR }),
  Object.freeze({ phase: 'night', from: 20 }),
]);

/** The phase an hour of the day is in. */
export function phaseFor(hour) {
  const h = wrapHour(hour);
  let name = PHASES[0].phase;
  for (const entry of PHASES) if (h >= entry.from) name = entry.phase;
  return name;
}

/** An hour, wrapped into `[0, 24)`. */
function wrapHour(hour) {
  const h = Number(hour) || 0;
  return ((h % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
}

/** Non-negative modulo. */
const mod = (n, m) => ((n % m) + m) % m;

/**
 * The town clock: what hour it is, given the world's day and the level's own seconds.
 *
 * One game minute every five real seconds (`GAME_MINUTES_PER_REAL_MINUTE`, the twin's
 * `TimeScale 12`), so a game day is two hours of play and a town's whole evening arrives
 * inside one sitting.
 *
 * @param {number} day      the world's calendar day (`radiant.day`) — the number a job's
 *   deadline is measured in, which travel moves and standing still does not
 * @param {number} seconds  seconds since this level was entered (the scene's own clock)
 * @param {{opensAt?: number}} [opts]  the hour the level's clock reads at `seconds === 0`
 *   (default `DAY_OPENS_HOUR`)
 * @returns {{day: number, hour: number, minute: number, minutes: number, phase: string, turned: number}}
 *   `minutes` is minutes past midnight — what every plan below is indexed by; `turned` is how
 *   many local days the level's own clock has rolled past, for a caller that wants the
 *   calendar to move with it (the port's calendar is travel's — S23 — so the scene does not).
 */
export function timeOfDay(day, seconds, opts = {}) {
  const opensAt = Number.isFinite(opts.opensAt) ? Number(opts.opensAt) : DAY_OPENS_HOUR;
  const elapsed = Math.max(0, Number(seconds) || 0) / SECONDS_PER_GAME_MINUTE;
  const since = opensAt * 60 + elapsed;
  const minutes = mod(Math.floor(since), MINUTES_PER_DAY);
  const hour = Math.floor(minutes / 60);
  return {
    day: Number.isFinite(Number(day)) ? Math.trunc(Number(day)) : 1,
    hour,
    minute: minutes % 60,
    minutes,
    phase: phaseFor(hour),
    turned: Math.floor(since / MINUTES_PER_DAY),
  };
}

// ── the trades, and the day each one lives ───────────────────────────────────

/** The eight things a person can be doing, and nothing else. */
export const ACTIVITIES = Object.freeze(
  ['sleep', 'openShop', 'work', 'eat', 'drink', 'worship', 'wander', 'goHome'],
);

/** The places a plan can name, as the words a HUD line can print. */
export const PLACES = Object.freeze(
  ['home', 'the shop', 'the tavern', 'the temple', 'the Mages Guild', 'the market', 'the street'],
);

/**
 * The door kind each place's business is behind, for `streetGoal`.
 *
 * A place with `null` is a *spot in the street* rather than a doorway — the market, the beat
 * — and a person whose day sends them there walks their own street instead of standing in
 * somebody's shop.
 */
const PLACE_DOOR = Object.freeze({
  'the shop': 'equipment',
  'the tavern': 'tavern',
  'the temple': 'temple',
  'the Mages Guild': 'mages',
  'the market': null,
  'the street': null,
  home: null,
});

/**
 * How many of the doors nearest a person's home a **wanderer**'s beat is drawn from.
 *
 * A wanderer has no trade to walk to, so their beat is a doorway of their own quarter: drawn
 * from the twelve nearest, a stroll of a handful of cells rather than a crossing of the city.
 * Twelve because a city's doors are dense enough that twelve of them are the same square or
 * the two streets either side of it, and few enough that the draw stays in one quarter.
 */
export const WANDER_BEATS = 12;

/**
 * How far a **wanderer's beat** may be from their home, in cells, and how many draws are tried.
 *
 * Six cells is a few paces across a square — fifteen metres — and it is the *street* they live
 * on rather than a journey: a person idling in a town drifts around their own end of it. Twelve
 * tries is enough to find standable paving in a city's blocks (each draw is from a 13×13 box,
 * and a person is placed on a street in the first place).
 */
export const WANDER_STEPS = 6;
export const WANDER_TRIES = 12;

/**
 * A trade's day: the anchors its 24 hours are built from.
 *
 * Each entry is `[hourOfDay, activity, where]`, and the list is **tiled**: the plan runs from
 * one anchor to the next and the last one round to the first, so the 24 hours are covered
 * once with no gap and no overlap. That shape is the twin's (`dayPlan.js`'s `ENTRIES`) and it
 * is worth keeping: a day assembled by hand is a day with a hole in it, and the hole is
 * always at three in the morning.
 *
 * The hours are this project's; the *shape* of each trade's day is the twin's (the keeper
 * keeps the shop, the innkeeper serves into the small hours, the watch walks its shifts).
 *
 * @type {Readonly<Record<string, ReadonlyArray<readonly [number, string, string]>>>}
 */
export const ROLE_PLANS = Object.freeze({
  /** An equipment store's keeper: opens at seven, in the tavern by dark. */
  smith: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([6, 'eat', 'home']),
    Object.freeze([7, 'openShop', 'the shop']),
    Object.freeze([18, 'drink', 'the tavern']),
    Object.freeze([20, 'wander', 'the street']),
    Object.freeze([22, 'goHome', 'home']),
  ]),
  /** A tavern keeper: pours into the small hours, sleeps the morning away. */
  bartender: Object.freeze([
    Object.freeze([0, 'openShop', 'the tavern']),
    Object.freeze([7, 'sleep', 'home']),
    Object.freeze([14, 'work', 'the tavern']),
    Object.freeze([17, 'openShop', 'the tavern']),
  ]),
  /** A Mages Guild's keeper: the hall open through the working day. */
  wizard: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([7, 'eat', 'home']),
    Object.freeze([8, 'openShop', 'the Mages Guild']),
    Object.freeze([17, 'work', 'the Mages Guild']),
    Object.freeze([19, 'wander', 'the street']),
    Object.freeze([21, 'goHome', 'home']),
  ]),
  /** A priest: the temple keeps early hours, and the evening service is the day's end. */
  priest: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([5, 'worship', 'the temple']),
    Object.freeze([7, 'openShop', 'the temple']),
    Object.freeze([12, 'eat', 'the tavern']),
    Object.freeze([13, 'openShop', 'the temple']),
    Object.freeze([19, 'worship', 'the temple']),
    Object.freeze([20, 'wander', 'the street']),
    Object.freeze([22, 'goHome', 'home']),
  ]),
  /** A merchant: a stall by day, a drink after. */
  merchant: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([7, 'eat', 'home']),
    Object.freeze([8, 'work', 'the market']),
    Object.freeze([18, 'drink', 'the tavern']),
    Object.freeze([21, 'goHome', 'home']),
  ]),
  vendor: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([7, 'eat', 'home']),
    Object.freeze([8, 'work', 'the market']),
    Object.freeze([17, 'wander', 'the street']),
    Object.freeze([19, 'drink', 'the tavern']),
    Object.freeze([21, 'goHome', 'home']),
  ]),
  /** A beggar: laid up where the day's trade is, out of the cold at night. */
  beggar: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([6, 'wander', 'the street']),
    Object.freeze([9, 'work', 'the market']),
    Object.freeze([17, 'drink', 'the tavern']),
    Object.freeze([20, 'goHome', 'home']),
  ]),
  /** The street's own entertainers — jester, musician, fire-eater, snake charmer. */
  performer: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([9, 'work', 'the market']),
    Object.freeze([12, 'eat', 'the tavern']),
    Object.freeze([13, 'work', 'the market']),
    Object.freeze([18, 'drink', 'the tavern']),
    Object.freeze([22, 'goHome', 'home']),
  ]),
  /** Somebody whose trade is the dark: asleep by day, on the street by night. */
  harlot: Object.freeze([
    Object.freeze([0, 'wander', 'the street']),
    Object.freeze([5, 'sleep', 'home']),
    Object.freeze([14, 'eat', 'the tavern']),
    Object.freeze([16, 'wander', 'the street']),
    Object.freeze([19, 'drink', 'the tavern']),
    Object.freeze([21, 'wander', 'the street']),
  ]),
  /** A shady character: keeps the market's hours and the tavern's, and little else. */
  shady: Object.freeze([
    Object.freeze([0, 'wander', 'the street']),
    Object.freeze([4, 'sleep', 'home']),
    Object.freeze([12, 'work', 'the market']),
    Object.freeze([16, 'wander', 'the street']),
    Object.freeze([19, 'drink', 'the tavern']),
    Object.freeze([23, 'wander', 'the street']),
  ]),
  /** A worker: an early start, an honest evening. */
  worker: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([6, 'work', 'the market']),
    Object.freeze([12, 'eat', 'the tavern']),
    Object.freeze([13, 'work', 'the market']),
    Object.freeze([17, 'drink', 'the tavern']),
    Object.freeze([20, 'goHome', 'home']),
  ]),
  /** A noble: late up, the street at midday, worship in the afternoon, wine at night. */
  noble: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([8, 'eat', 'home']),
    Object.freeze([10, 'wander', 'the street']),
    Object.freeze([14, 'worship', 'the temple']),
    Object.freeze([17, 'drink', 'the tavern']),
    Object.freeze([21, 'goHome', 'home']),
  ]),
  /** A monk: the offices are before dawn and the day is the temple's. */
  monk: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([4, 'worship', 'the temple']),
    Object.freeze([8, 'work', 'the temple']),
    Object.freeze([12, 'eat', 'the temple']),
    Object.freeze([18, 'wander', 'the street']),
    Object.freeze([20, 'goHome', 'home']),
  ]),
  /**
   * Somebody with no recorded trade: a body in the street, and their day says so.
   *
   * Half of Arena's folk items *are* this (`man`, `woman`) and the rest of the town is built
   * from whatever the roster gives; nobody is given a trade the game did not record (the same
   * line S30 takes about names).
   */
  townsperson: Object.freeze([
    Object.freeze([0, 'sleep', 'home']),
    Object.freeze([7, 'eat', 'home']),
    Object.freeze([8, 'wander', 'the street']),
    Object.freeze([12, 'eat', 'the tavern']),
    Object.freeze([14, 'wander', 'the street']),
    Object.freeze([18, 'drink', 'the tavern']),
    Object.freeze([21, 'goHome', 'home']),
  ]),
});

/**
 * The watch's three shifts, in hours (the night's runs past midnight: 22 to 06).
 *
 * The twin's `WATCH_SHIFTS` exactly. `onDuty` is read from the hour alone, so a watchman's
 * beat and the player's clock can never disagree about it.
 */
export const WATCH_SHIFTS = Object.freeze([
  Object.freeze({ shift: 'day', from: 6, to: 14 }),
  Object.freeze({ shift: 'evening', from: 14, to: 22 }),
  Object.freeze({ shift: 'night', from: 22, to: 30 }),
]);
/** A watchman's shift is a shift later each day, and the fourth day is his own (the twin's law). */
export const WATCH_ROTATION = WATCH_SHIFTS.length;
/** How many days of the rotation a watchman works: three on, one off. */
export const WATCH_PERIOD = WATCH_ROTATION + 1;
/**
 * How many days a town's week holds, for the rest of its people.
 *
 * **This project's number.** The twin keeps a weekly rhythm for its residents (its own ledger
 * of habits), and Arena records nothing at all about anybody's week. So a town's ordinary
 * people take **one day in seven** — the smallest claim that still makes a town get quieter
 * some days rather than never — while the watch keeps its own harder rotation (`WATCH_PERIOD`,
 * three days on and the fourth his own), which is the twin's law and needs no invention.
 */
export const TOWN_WEEK_DAYS = 7;

/** The trades that stand a watch. */
const WATCH_ROLES = Object.freeze(['watch', 'knight', 'guard']);

/** The alias table: what a person's recorded trade is called → a plan key. */
const ROLE_ALIASES = Object.freeze({
  // the trades an interior's own signs record (`game/shops.js`)
  equipment: 'smith', smith: 'smith',
  tavern: 'bartender', bartender: 'bartender', innkeeper: 'bartender',
  mages: 'wizard', wizard: 'wizard',
  temple: 'priest', priest: 'priest',
  house: 'townsperson', noble: 'noble',
  // the people an `.INF` flat's `*ITEM` records (`game/dungeonItems.js`)
  beggar: 'beggar', 'fire-eater': 'performer', jester: 'performer', musician: 'performer',
  'snake charmer': 'performer', harlot: 'harlot', merchant: 'merchant', vendor: 'vendor',
  'shady character': 'shady', worker: 'worker', knight: 'watch', guard: 'watch',
  watch: 'watch', monk: 'monk', 'jagar tharn': 'noble',
  man: 'townsperson', woman: 'townsperson', townsperson: 'townsperson',
});

/**
 * What trade a person is in, as a plan key.
 *
 * The order is the order of what the game actually recorded: a **role** the caller passed in
 * (the item table's word for them), then the **shop they keep** (an interior's own `*MENU`
 * sign), then nothing at all — a townsperson. What somebody is *wearing* is deliberately not
 * consulted: armour says what a person has on, not what they do, and a rule that read a trade
 * out of it would be inventing one.
 *
 * @param {object|null|undefined} person
 * @returns {string} a key of `ROLE_PLANS`
 */
export function roleOf(person) {
  const named = String(person?.role ?? '').trim().toLowerCase();
  if (named && ROLE_ALIASES[named]) return ROLE_ALIASES[named];
  const kind = String(person?.shop?.kind ?? '').trim().toLowerCase();
  if (kind && ROLE_ALIASES[kind]) return ROLE_ALIASES[kind];
  return 'townsperson';
}

/** Whether a person is one of the watch. */
const isWatch = (person) => WATCH_ROLES.includes(String(person?.role ?? '').trim().toLowerCase());

/**
 * A person's own seed: their home cell and what they wear, hashed.
 *
 * Never a random draw — a person's day has to be the same day on every reader's machine and
 * on every visit, and the placement the scene already made (`townsfolk.placeTownsfolk`) is
 * deterministic from the settlement's seed, so the person's *own* number is derived from the
 * part of them that does not move: the cell they were placed on.
 *
 * @param {object|null|undefined} person
 * @returns {number} a 32-bit seed
 */
export function personSeed(person) {
  const home = person?.home ?? person?.place ?? { row: 0, col: 0 };
  const text = `${Math.trunc(Number(home.row) || 0)},${Math.trunc(Number(home.col) || 0)},${String(person?.armour ?? '')},${roleOf(person)}`;
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/** A day's own draw: the person's seed mixed with the day's number. */
function dayRandom(person, day) {
  return new ArenaRandom((personSeed(person) ^ Math.imul(Math.trunc(day) || 1, 2654435761)) >>> 0);
}

/**
 * One day in seven is not a working day.
 *
 * The twin's watch keeps three shifts and takes the fourth day off, and its whole town keeps
 * a weekly rhythm; this is the same law for a town whose only recorded quantity is the
 * person themselves. Deterministic in the person's seed *and* the day: a town is quieter one
 * day in seven, and it is always the same people who are off.
 *
 * @param {object} person @param {number} day
 * @returns {boolean}
 */
export function offDay(person, day) {
  return mod(Math.trunc(personSeed(person) % TOWN_WEEK_DAYS) + Math.trunc(day || 0), TOWN_WEEK_DAYS) === TOWN_WEEK_DAYS - 1;
}

/**
 * What shift the watch is keeping on `day`, and whether this watchman is on it.
 *
 * The twin's rotation (`WATCH_ROTATION`): a watchman's company turns a shift later every day
 * and the fourth day is his own. `hours` is the shift's own window, with the night's running
 * past midnight as `[22, 30]` — the hours of the *day it began on*, exactly as the twin's
 * `nightTail` says.
 *
 * @param {object} person @param {number} day
 * @returns {{shift: 'day'|'evening'|'night'|'off', onDuty: boolean, hours: readonly [number, number]|null}}
 */
export function watchShift(person, day) {
  const slot = personSeed(person) % WATCH_PERIOD;
  const turn = mod(slot + Math.trunc(day || 0), WATCH_PERIOD);
  if (turn >= WATCH_ROTATION) return { shift: 'off', onDuty: false, hours: null };
  const shift = WATCH_SHIFTS[turn];
  return { shift: /** @type {'day'|'evening'|'night'} */ (shift.shift), onDuty: true, hours: [shift.from, shift.to] };
}

/**
 * The watchman's plan: his shift on duty, and his own day off it.
 *
 * A watchman on shift is **on the street** — his beat, which `streetGoal` walks him round the
 * town's own doors — and off it he lives an ordinary townsperson's day, shifted around the
 * shift he just stood. That is the whole of it: no patrol routes are invented here, because
 * the only street furniture the port has to route on is the town's door list.
 *
 * @param {object} person @param {number} day
 * @returns {ReadonlyArray<readonly [number, string, string]>}
 */
function watchAnchors(person, day) {
  const { shift, onDuty } = watchShift(person, day);
  if (!onDuty) return ROLE_PLANS.townsperson;
  // **A shift never straddles midnight in this list**, because every block of a plan is a
  // window *inside* one day: the night's shift (22:00–06:00) is the two blocks 22:00–24:00 and
  // 00:00–06:00, and the man's sleep is the morning he has left. That is the twin's own
  // reading of the night too — `nightTail` answers where a night watchman stands at the day's
  // turn rather than pretending his shift is part of the next day.
  if (shift === 'night') {
    return [
      [0, 'work', 'the street'],
      [6, 'eat', 'home'],
      [7, 'sleep', 'home'],
      [15, 'wander', 'the street'],
      [17, 'drink', 'the tavern'],
      [19, 'goHome', 'home'],
      [22, 'work', 'the street'],
    ];
  }
  if (shift === 'evening') {
    return [
      [0, 'sleep', 'home'],
      [7, 'eat', 'home'],
      [8, 'wander', 'the street'],
      [12, 'eat', 'the tavern'],
      [14, 'work', 'the street'],
      [22, 'eat', 'the tavern'],
      [23, 'goHome', 'home'],
    ];
  }
  // The day's watch: six to two, and the evening is his own.
  return [
    [0, 'sleep', 'home'],
    [6, 'work', 'the street'],
    [14, 'eat', 'the tavern'],
    [15, 'wander', 'the street'],
    [18, 'drink', 'the tavern'],
    [21, 'goHome', 'home'],
  ];
}

/**
 * A person's day: 24 hours, tiled, in their own trade's order.
 *
 * The anchors are jittered by up to half an hour from the person's own day-seeded draw, so
 * the town does not open every door on the same minute; the same person on the same day draws
 * the same jitter, which is what makes this a *schedule* rather than a random walk.
 *
 * @param {object} person
 * @param {{day?: number, place?: string}} [opts]  `place` is unused by the plan itself and
 *   carried so a caller can hand the same options to every function here
 * @returns {{from: number, to: number, activity: string, where: string}[]} minutes past
 *   midnight, covering `[0, 1440)` exactly once
 */
export function dayPlanFor(person, opts = {}) {
  const day = Number.isFinite(Number(opts.day)) ? Math.trunc(Number(opts.day)) : 1;
  const role = roleOf(person);
  // The watch is the one trade whose day is drawn from the calendar rather than from an
  // anchor list, and a watchman's day off is the rotation's, never the weekly one below.
  if (isWatch(person)) return tile(jitter(watchAnchors(person, day), person, day));
  // Everybody else's week: a rest day is a townsperson's day.
  if (role !== 'townsperson' && offDay(person, day)) return tile(jitter(ROLE_PLANS.townsperson, person, day));
  return tile(jitter(ROLE_PLANS[role] ?? ROLE_PLANS.townsperson, person, day));
}

/**
 * Move each anchor of a day by up to half an hour, from the person's own day draw.
 *
 * The first anchor stays at midnight (a day has to start somewhere) and the order is
 * preserved, so a day whose anchors are half an hour apart cannot have two of them swap.
 */
function jitter(anchors, person, day) {
  const random = dayRandom(person, day);
  const out = [];
  for (let i = 0; i < anchors.length; i++) {
    const [hour, activity, where] = anchors[i];
    const shift = i === 0 ? 0 : (random.nextBelow(61) - 30) / 60;
    out.push({ hour: Math.max(0, hour + shift), activity, where });
  }
  return out.sort((a, b) => a.hour - b.hour);
}

/**
 * Turn anchors into a tiled day: one block per anchor, running to the next one and the last
 * round to midnight, so the 24 hours are covered exactly once however the anchors fall.
 *
 * @param {{hour: number, activity: string, where: string}[]} anchors
 * @returns {{from: number, to: number, activity: string, where: string}[]}
 */
function tile(anchors) {
  const list = anchors.slice().sort((a, b) => a.hour - b.hour);
  if (!list.length) return tile(jitter(ROLE_PLANS.townsperson, { home: { row: 0, col: 0 } }, 1));
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const from = i === 0 ? 0 : Math.round(list[i].hour * 60);
    const next = i + 1 < list.length ? list[i + 1] : list[0];
    const to = i + 1 < list.length ? Math.round(next.hour * 60) : MINUTES_PER_DAY;
    if (to <= from) continue; // two anchors on the same minute: the later one wins
    out.push({ from, to, activity: list[i].activity, where: list[i].where });
  }
  if (!out.length) return [{ from: 0, to: MINUTES_PER_DAY, activity: 'sleep', where: 'home' }];
  out[out.length - 1].to = MINUTES_PER_DAY;
  return out;
}

/**
 * Plans, kept: one person's day is the same day for the whole of a level.
 *
 * The twin keeps its favourites in a `WeakMap` for exactly this reason (`LW-PERF`), and the
 * cost here is the same shape: a plan is a handful of JS objects built from a seeded draw,
 * and `scheduleMoves` asks for one per person per frame. The key is the person's seed and the
 * day; the entry is dropped when the table grows past `PLAN_CACHE_MAX`, so a session that
 * walks the whole of Tamriel cannot grow it without bound.
 */
const planCache = new Map();
const PLAN_CACHE_MAX = 512;

/** The plan for a person and a day, cached. */
function cachedPlan(person, day) {
  const key = `${personSeed(person)}:${day}:${roleOf(person)}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const plan = dayPlanFor(person, { day });
  if (planCache.size >= PLAN_CACHE_MAX) {
    // The oldest entry goes: `Map` keeps insertion order, and a plan nobody has asked for
    // since it was built is the one to lose.
    planCache.delete(planCache.keys().next().value);
  }
  planCache.set(key, plan);
  return plan;
}

/**
 * What a person is doing now.
 *
 * @param {object} person
 * @param {{day?: number, minutes: number}} clock  a `timeOfDay` result (or anything with the
 *   same two fields)
 * @returns {{activity: string, where: string, since: number, until: number}} minutes past
 *   midnight for `since`/`until`, so a caller can say how long somebody has been at it
 */
export function currentActivity(person, clock) {
  const day = Number.isFinite(Number(clock?.day)) ? Math.trunc(Number(clock.day)) : 1;
  const minutes = mod(Math.trunc(Number(clock?.minutes) || 0), MINUTES_PER_DAY);
  const plan = cachedPlan(person, day);
  // The answer is the *documented* shape on every path: `from`/`to` are the plan's own words
  // for the block's edges and `since`/`until` are what a caller reads, so one block is never
  // handed out in two shapes (`scenes/interior.js` asks how long somebody has been at it).
  for (const block of plan) {
    if (minutes >= block.from && minutes < block.to) return { activity: block.activity, where: block.where, since: block.from, until: block.to };
  }
  // Unreachable while `tile` covers the day, and answered rather than thrown: a plan is data
  // and a caller with a clock should never have to guard a loop over it.
  const last = plan[plan.length - 1];
  return { activity: last.activity, where: last.where, since: last.from, until: last.to };
}

/**
 * Whether a shop kind is open at this hour.
 *
 * The hours are this project's (Arena's are in `A.EXE`), and they are the *whole* of what
 * makes a shut door a real answer rather than a defect: an equipment store shuts at six, a
 * tavern pours until two, the Mages Guild keeps an office day, and a temple is open from
 * before dawn. A **house or a noble house is never open**: those are homes, not shops, and a
 * caller that treated them as trade would be inventing a business.
 *
 * @param {string} kind   a `game/shops.js` kind
 * @param {{minutes: number}} clock
 * @returns {boolean}
 */
export function isOpen(kind, clock) {
  const minutes = mod(Math.trunc(Number(clock?.minutes) || 0), MINUTES_PER_DAY);
  const ranges = SHOP_HOURS[String(kind ?? '').toLowerCase()];
  if (!ranges) return false;
  return ranges.some(([from, to]) => (to <= MINUTES_PER_DAY
    ? minutes >= from && minutes < to
    : minutes >= from || minutes < to - MINUTES_PER_DAY));
}

/**
 * When each kind of shop keeps its doors open, in minutes past midnight.
 *
 * A range that ends past midnight is written past it (`[600, 1560]` is ten in the morning to
 * two the next morning), which is the twin's own way of writing the night's watch shift.
 *
 * @type {Readonly<Record<string, ReadonlyArray<readonly [number, number]>>>}
 */
export const SHOP_HOURS = Object.freeze({
  equipment: Object.freeze([Object.freeze([480, 1080])]),                  // 08:00 – 18:00
  tavern: Object.freeze([Object.freeze([600, 1560])]),                     // 10:00 – 02:00
  mages: Object.freeze([Object.freeze([540, 1020])]),                      // 09:00 – 17:00
  temple: Object.freeze([Object.freeze([360, 1200])]),                     // 06:00 – 20:00
});

/** The trade that keeps each kind of door — the shop a person of that trade walks to. */
const TRADE_DOOR = Object.freeze({
  smith: 'equipment', bartender: 'tavern', wizard: 'mages', priest: 'temple',
});

/** A door of a kind, nearest the person's own cell (their *home*, never where they stand). */
function nearestDoor(doors, kind, home) {
  const wanted = kind ? doors.filter((door) => String(door?.kind ?? '').toLowerCase() === kind) : doors.slice();
  if (!wanted.length) return null;
  const row = Math.trunc(Number(home?.row) || 0);
  const col = Math.trunc(Number(home?.col) || 0);
  let best = null;
  for (const door of wanted) {
    const distance = Math.abs(Math.trunc(Number(door.row) || 0) - row) + Math.abs(Math.trunc(Number(door.col) || 0) - col);
    if (!best || distance < best.distance) best = { door, distance };
  }
  return best?.door ?? null;
}

/**
 * The door a person is walking to, and why.
 *
 * **Their own cell is a destination too.** Half of a day is spent at home, and a person's home
 * is the street cell the game placed them on (`townsfolk.placeTownsfolk`'s `place`) — the data
 * records no doors for homes, so a plan that sent somebody "home" to a *building* would be
 * inventing one. So `home` is a goal with no door behind it, and the walker stops on the cell.
 *
 * The distance is measured from the person's **home**, never from where they are standing: a
 * goal that moved as a person walked would make them turn round halfway down the street, and
 * the same person at the same clock would give two different answers.
 *
 * @param {object} person
 * @param {{day?: number, minutes: number}} clock
 * @param {{doors?: {row: number, col: number, kind?: string}[]}} [opts]
 * @returns {{row: number, col: number, reason: string}|null} null when the town's own data
 *   gives this person nowhere to go (a level with no doors at all, and no home cell)
 */
export function streetGoal(person, clock, opts = {}) {
  const doors = Array.isArray(opts.doors) ? opts.doors.filter((door) => Number.isFinite(Number(door?.row)) && Number.isFinite(Number(door?.col))) : [];
  const here = currentActivity(person, clock);
  const home = person?.home ?? person?.place ?? null;

  // Home is a place, not a doorway: a person going home walks to the cell they were placed on.
  if (here.where === 'home') {
    if (!home) return null;
    return { row: Math.trunc(Number(home.row) || 0), col: Math.trunc(Number(home.col) || 0), reason: here.activity === 'sleep' ? 'home to sleep' : 'home' };
  }
  const reasonFor = {
    openShop: 'to open the shop', work: 'to work', eat: 'to eat', drink: 'for a drink',
    worship: 'to pray', wander: 'to wander', goHome: 'home', sleep: 'home to sleep',
  };

  // **A wanderer is asked about first**, before the level's door count: a wanderer's beat is a
  // stretch of their own street and is not a doorway at all, so a level with no doors in its own
  // data (every building's interior) still has somewhere to send them when a caller can hand
  // over the grid — and a level whose doors are all far away is exactly the case the beat exists
  // for.
  if (here.activity === 'wander') {
    // **A beat of their own, a few paces from their own door.** The draw is the person's and
    // the day's, so the same person wanders the same way round the same town every time — and
    // what they draw is a **cell within `WANDER_STEPS` of their home**, checked against the
    // level's own walkable grid when the caller can hand one over (`opts.nav`, the same grid
    // the walk is planned over).
    //
    // This went through two worse answers. The first drew from **every door in the settlement**:
    // a city's wanderer set off for the far side of it — a walk of seventy cells, eighty seconds
    // of a player's time, and near streets left empty because everybody was somewhere else
    // walking. The second drew from the twelve doors *nearest their home*, which is still not a
    // stroll: a real city's doors are sparse (54 of them over 128×128 cells in Daggerfall), so
    // "the twelve nearest" can be thirty cells off, and the running game showed exactly that —
    // wanderers mid-route from (2,14) to (9,51). A **beat is a place, not a shop**: it is a
    // neighbouring stretch of their own street, which is what a person idling in a town actually
    // does.
    const home0 = home ?? person?.place ?? null;
    const from = home0 ? { row: Math.trunc(Number(home0.row) || 0), col: Math.trunc(Number(home0.col) || 0) } : null;
    const random = dayRandom(person, Number(clock?.day) || 0);
    if (from && typeof opts.nav?.open === 'function') {
      for (let attempt = 0; attempt < WANDER_TRIES; attempt++) {
        const row = from.row + (random.nextBelow(2 * WANDER_STEPS + 1) - WANDER_STEPS);
        const col = from.col + (random.nextBelow(2 * WANDER_STEPS + 1) - WANDER_STEPS);
        if (row === from.row && col === from.col) continue;
        if (!opts.nav.open(row, col)) continue;
        return { row, col, reason: reasonFor.wander };
      }
      // Nothing standable within a few paces — a person walled into a nook. Their own cell is
      // then the beat, and the scene's own idle step is what paces them (the caller's fallback).
    }
    const near = from
      ? doors.slice().sort((a, b) => (
        (Math.abs(Math.trunc(a.row) - from.row) + Math.abs(Math.trunc(a.col) - from.col))
        - (Math.abs(Math.trunc(b.row) - from.row) + Math.abs(Math.trunc(b.col) - from.col))
      )).slice(0, WANDER_BEATS)
      : doors;
    const first = random.nextBelow(near.length);
    // **Never their own cell.** A beat that is the paving they are standing on is not a walk,
    // and a person given one stands still for ever: the draw is deterministic, so they would be
    // handed the same non-goal every time they asked. The next one along is still their own
    // beat, and it is somewhere.
    for (let i = 0; i < near.length; i++) {
      const door = near[(first + i) % near.length];
      const row = Math.trunc(door.row);
      const col = Math.trunc(door.col);
      if (!from || row !== from.row || col !== from.col) return { row, col, reason: reasonFor.wander };
    }
    return from ? { row: from.row, col: from.col, reason: 'their own street' } : null;
  }

  if (!doors.length) {
    // No doors in the level's own data: the street itself is the goal, which is what the
    // scene's own idle step already does, and it is said rather than faked with a door.
    if (!home) return null;
    return { row: Math.trunc(Number(home.row) || 0), col: Math.trunc(Number(home.col) || 0), reason: 'their own street' };
  }

  // **A person's own trade is a preference before the place's kind is.** A smith at work walks
  // to an equipment store — his own, if the town has one — and a smith who is only eating
  // still takes the tavern; the place's own kind (the door the day sent them to) decides when
  // their trade has no door of its own, which is what a market stall and a beat have.
  const placeKind = PLACE_DOOR[here.where] ?? null;
  const tradeKind = TRADE_DOOR[roleOf(person)] ?? null;
  const working = here.activity === 'openShop' || here.activity === 'work';
  const wantKind = working ? (tradeKind ?? placeKind) : (placeKind ?? tradeKind);
  const door = nearestDoor(doors, wantKind, home) ?? nearestDoor(doors, null, home);
  if (!door) return home ? { row: Math.trunc(home.row), col: Math.trunc(home.col), reason: 'their own street' } : null;
  return { row: Math.trunc(door.row), col: Math.trunc(door.col), reason: reasonFor[here.activity] ?? 'about their business' };
}

// ── the watch ────────────────────────────────────────────────────────────────

/** What the watch does about each crime a street can produce, this project's numbers. */
export const CRIME_RESPONSE = Object.freeze({
  theft: Object.freeze({ count: 1, action: 'warn' }),
  assault: Object.freeze({ count: 2, action: 'attack' }),
  murder: Object.freeze({ count: 4, action: 'attack' }),
});
/** The most watchmen one crime brings. The twin caps its own waves (`TOWN_WATCH_MAX_WAVES`). */
export const WATCH_MAX = 5;
/**
 * What the watch's own response is worth in the ledger.
 *
 * The *crime* is already paid for by `game/regard.js` (`struck` −45, `slain` −75, `theft`
 * −15) — and it is paid to the **people**, not to the watch. This is the extra the watch
 * itself adds: being marched off by the guard tells the street who you are, and a warning
 * tells nobody. Nothing is charged twice.
 */
export const WATCH_REGARD = Object.freeze({ warn: 0, arrest: -10, attack: 0 });

/**
 * What the watch does about a crime.
 *
 * **A crime nobody saw is nobody's business** — the twin's own rule, and the port's already
 * (`scenes/interior.js`'s `strikeFolk` only turns the people who were standing there), so the
 * witness count comes first and a murder with no witnesses brings nothing. Past that:
 *
 *   * a **murder** with the watch standing there is an **arrest** (they have the man, and
 *     Arena's own watch takes him rather than cutting him down in the street);
 *   * a murder, or an assault, with witnesses anywhere, is the watch coming **armed**;
 *   * a **theft** seen by a guard is a **warning** — nobody is arrested over a stolen purse
 *     the street only half-saw.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.crime]  `'theft'` | `'assault'` | `'murder'` | null/`'none'`
 * @param {number} [opts.witnesses]   how many people saw it
 * @param {boolean} [opts.guardNear]  whether one of the watch is in sight of it
 * @param {number} [opts.regard]      the player's standing with the wronged party as it now
 *   stands (a negative is what the crime already cost)
 * @returns {{respond: boolean, action: 'none'|'warn'|'arrest'|'attack', reason: string, regardDelta: number}}
 */
export function watchDecision(opts = {}) {
  const crime = String(opts.crime ?? 'none').toLowerCase();
  const witnesses = Math.max(0, Math.trunc(Number(opts.witnesses) || 0));
  const guardNear = Boolean(opts.guardNear);
  const regard = Number.isFinite(Number(opts.regard)) ? Number(opts.regard) : 0;
  if (!CRIME_RESPONSE[crime]) {
    return { respond: false, action: 'none', reason: 'no crime to answer', regardDelta: 0 };
  }
  if (witnesses <= 0 && !guardNear) {
    return { respond: false, action: 'none', reason: 'nobody saw it', regardDelta: 0 };
  }
  if (crime === 'murder' && guardNear) {
    return { respond: true, action: 'arrest', reason: 'the watch had the man in sight', regardDelta: WATCH_REGARD.arrest };
  }
  if (crime === 'theft' && !guardNear) {
    return { respond: true, action: 'warn', reason: 'the street saw it, and the watch heard', regardDelta: WATCH_REGARD.warn };
  }
  if (crime === 'theft') {
    return { respond: true, action: 'warn', reason: 'a watchman saw the purse go', regardDelta: WATCH_REGARD.warn };
  }
  return {
    respond: true,
    action: CRIME_RESPONSE[crime].action,
    // A player the town already hates gets no ceremony about it: the watch answers the
    // crime it was called to and the ledger's own number is what it already cost.
    reason: regard <= 0 ? 'the watch answers the cry' : `the watch answers the cry for a ${crime}`,
    regardDelta: WATCH_REGARD[CRIME_RESPONSE[crime].action] ?? 0,
  };
}

/**
 * How many of the watch come, and what they do when they arrive.
 *
 * The squad is the **crime's own strength** (`CRIME_RESPONSE`'s `count`) plus a small draw
 * from the day's own seed, so two murders do not bring identical squads, and it is capped at
 * `WATCH_MAX` **in total** — `guards` is how many of the watch are already standing, and the
 * cap is what stops a street from growing a fresh squad every time one is cut down (the
 * defect the twin's `TOWN_WATCH_MAX_WAVES` exists for). A town whose watch is already at its
 * cap sends nobody and says so.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.crime]
 * @param {number} [opts.guards]  how many of the watch are standing already
 * @param {number} [opts.day]
 * @param {number} [opts.seed]    a settlement's seed (the place's own)
 * @returns {{count: number, action: 'none'|'warn'|'arrest'|'attack', note: string}}
 */
export function watchSpawn(opts = {}) {
  const crime = String(opts.crime ?? 'none').toLowerCase();
  const response = CRIME_RESPONSE[crime];
  const guards = Math.max(0, Math.trunc(Number(opts.guards) || 0));
  const day = Number.isFinite(Number(opts.day)) ? Math.trunc(Number(opts.day)) : 1;
  if (!response) return { count: 0, action: 'none', note: 'The watch has nothing to answer.' };
  const random = new ArenaRandom((((Number(opts.seed) || 1) >>> 0) ^ Math.imul(day, 0x9e3779b1) ^ (crime.length * 7919)) >>> 0);
  const wanted = response.count + (random.nextBelow(2));
  const room = Math.max(0, WATCH_MAX - guards);
  const count = Math.min(wanted, room);
  if (!count) {
    return { count: 0, action: 'none', note: 'The watch is already here, and there are no more to send.' };
  }
  const word = count === 1 ? 'One of the watch' : count === 2 ? 'Two of the watch' : count === 3 ? 'Three of the watch' : count === 4 ? 'Four of the watch' : 'Five of the watch';
  const note = response.action === 'warn'
    ? `${word} saw it, and told you so.`
    : response.action === 'arrest'
      ? `${word} have you, and it is the guardhouse for you.`
      : `${word} come at a run, weapons out.`;
  return { count, action: response.action, note };
}

// ── the frame's own question ─────────────────────────────────────────────────

/**
 * What every person means to do next, for the frame the scene is on.
 *
 * One row per person, in the order they were handed in: what they are doing, where that is,
 * and the cell they are walking to (`streetGoal`'s answer, or null when the town's own data
 * gives them nowhere). The scene applies this to its own walkers — nothing here moves
 * anybody, which is what lets the whole town be checked without a browser.
 *
 * @param {object[]} people
 * @param {{day?: number, minutes: number}} clock
 * @param {{doors?: object[], place?: string}} [opts]  `place` names a person's id (the same
 *   `place#row,col` key the regard ledger uses); without it the id is the home cell alone
 * @returns {{id: string|null, activity: string, where: string, goal: {row: number, col: number, reason: string}|null}[]}
 */
export function scheduleMoves(people, clock, opts = {}) {
  const doors = Array.isArray(opts.doors) ? opts.doors : [];
  const place = typeof opts.place === 'string' ? opts.place : null;
  const out = [];
  for (const person of people ?? []) {
    if (!person || person.down) continue;
    const here = currentActivity(person, clock);
    const home = person.home ?? person.place ?? null;
    out.push({
      id: place ? personId(place, home) : (home ? `${Math.trunc(Number(home.row) || 0)},${Math.trunc(Number(home.col) || 0)}` : null),
      activity: here.activity,
      where: here.where,
      goal: streetGoal(person, clock, { doors }),
    });
  }
  return out;
}

/** How a person's day reads on a panel, in the game's voice. */
export function activityWord(person, clock) {
  const here = currentActivity(person, clock);
  const who = person?.description ? String(person.description) : 'this person';
  return `${who} is ${here.activity === 'openShop' ? 'keeping' : here.activity === 'work' ? 'at work at' : here.activity === 'goHome' ? 'heading' : here.activity === 'sleep' ? 'abed at' : here.activity === 'drink' ? 'drinking at' : here.activity === 'eat' ? 'eating at' : here.activity === 'worship' ? 'at prayer in' : 'walking'} ${here.where}`;
}
