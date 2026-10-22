// Run:  node --test tests/unit/livingworld.test.mjs
//
// The town's clock, the hours each trade keeps, the day each trade lives, and the watch — the
// half of the twin's living world that is pure (`src/game/livingWorld.js`), so it can be held
// to its laws without a browser. The laws that matter, and that a scene depends on:
//
//   * the clock is **arithmetic**, and the same inputs always give the same hour;
//   * the hours are **ranges**, including the one that runs past midnight (a tavern shuts at
//     two, which is 1560 minutes and not a smaller number than the hour it opens);
//   * every trade the game can draw has a plan, and a plan **tiles all twenty-four hours** —
//     a person with an hour of nothing is a person standing still at noon for no reason;
//   * a crime **nobody saw brings nobody**, a murder in a watchman's sight is an arrest, and
//     the squad is capped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITIES, CRIME_RESPONSE, DAY_OPENS_HOUR, GAME_MINUTES_PER_REAL_MINUTE, HOURS_PER_DAY,
  MINUTES_PER_DAY, PHASES, ROLE_PLANS, SECONDS_PER_DAY, SECONDS_PER_GAME_MINUTE, SHOP_HOURS,
  WANDER_BEATS, WANDER_STEPS, WATCH_MAX, WATCH_ROTATION, activityWord, currentActivity, dayPlanFor, isOpen, offDay, phaseFor,
  POST_ACTIVITIES, roleOf, scheduleMoves, secondsForMinutes, streetGoal, timeOfDay, watchDecision,
  watchShift,
  watchSpawn,
} from '../../src/game/livingWorld.js';
import { DAWN_HOUR, DUSK_HOUR, isNight } from '../../src/game/daylight.js';

const clockAt = (minutes, day = 1) => ({ day, minutes, hour: Math.floor(minutes / 60), minute: minutes % 60, phase: phaseFor(Math.floor(minutes / 60)) });
const person = (extra = {}) => ({ home: { row: 10, col: 12 }, place: { row: 10, col: 12 }, role: 'smith', armour: 'chain', ...extra });

// ── the clock ─────────────────────────────────────────────────────────────────

test('the clock is arithmetic: a game minute every five seconds, from the arrival hour', async () => {
  assert.equal(DAY_OPENS_HOUR, 6, 'the module\'s own default opening hour');
  // **The rate is the twin's own** (`TimeScale 12`): a game minute every five real seconds, so a
  // game day is two hours of play. One game minute a real minute — which this module divided by
  // until now — made a day last a day, and hid the whole of the living world from a player.
  assert.equal(GAME_MINUTES_PER_REAL_MINUTE, 12);
  assert.equal(SECONDS_PER_GAME_MINUTE, 5);
  assert.equal(SECONDS_PER_DAY, MINUTES_PER_DAY * 5, 'a game day is 7200 seconds of play');
  const at0 = timeOfDay(1, 0);
  assert.equal(at0.hour, 6, 'a level entered reads six in the morning by default');
  assert.equal(at0.minute, 0);
  assert.equal(at0.phase, 'morning');
  assert.equal(at0.minutes, 360);
  // The scene's own clock is in seconds and the town keeps time in minutes.
  assert.equal(timeOfDay(1, 5).minutes, 361, 'five seconds of play is a minute of the town\'s day');
  assert.equal(timeOfDay(1, 3600).hour, 18, 'an hour of play is twelve hours of the town\'s day');
  assert.equal(secondsForMinutes(60), 300, 'and the conversion runs the other way too');
  // The scene's own opening hour, which is what the game actually passes (`interior.js`).
  assert.equal(timeOfDay(1, 0, { opensAt: 10 }).minutes, 600);
  assert.equal(timeOfDay(1, 0, { opensAt: 23 }).hour, 23);
  // Past midnight the local day rolls, and `turned` says how many times.
  const rolled = timeOfDay(1, SECONDS_PER_DAY, { opensAt: 0 });
  assert.equal(rolled.turned, 1, 'a day of play is one local day past midnight');
  assert.equal(rolled.minutes, 0);
  assert.equal(rolled.hour, 0);
  // The world's own day is carried through untouched: travel moves the calendar, standing still
  // does not.
  assert.equal(timeOfDay(37, 120, { opensAt: 10 }).day, 37);
});

test('the phases cover the whole day, in order, with no gap and no overlap', async () => {
  let previous = -1;
  for (const entry of PHASES) {
    assert.ok(entry.from > previous, `${entry.phase} starts after the one before it`);
    previous = entry.from;
  }
  assert.equal(PHASES[0].from, 0, 'the day starts at midnight');
  for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
    assert.ok(typeof phaseFor(hour) === 'string' && phaseFor(hour).length, `hour ${hour} has a phase`);
  }
  assert.equal(phaseFor(0), 'deepnight');
  assert.equal(phaseFor(4), 'deepnight', 'four in the morning is the dead of it');
  assert.equal(phaseFor(DAWN_HOUR - 1), 'dawn', 'the sky lightens an hour before the sun is up');
  assert.equal(phaseFor(11), 'midday');
  assert.equal(phaseFor(23), 'night');
  assert.equal(phaseFor(24), phaseFor(0), 'the hour wraps');
  // **The phase names are the sun's own hours**, not a second clock: `game/daylight.js` carries
  // DFU's DawnHour 6 / DuskHour 18 and lights the frame with them, so a phase table that called
  // five in the afternoon "dusk" would be contradicting the sky — as it did until now.
  assert.equal(phaseFor(DAWN_HOUR), 'morning', 'the sun is up when the morning starts');
  assert.equal(phaseFor(DUSK_HOUR), 'dusk', 'and it is down when dusk does');
  assert.equal(isNight(DUSK_HOUR * 60), true, 'which is the same hour daylight calls night');
  assert.equal(isNight(DAWN_HOUR * 60), false);
});

// ── opening hours ─────────────────────────────────────────────────────────────

test('every trade keeps hours, and the one that runs past midnight really does', async () => {
  assert.deepEqual(Object.keys(SHOP_HOURS).sort(), ['equipment', 'mages', 'tavern', 'temple']);
  // The smith: 08:00–18:00.
  assert.equal(isOpen('equipment', clockAt(8 * 60)), true);
  assert.equal(isOpen('equipment', clockAt(17 * 60 + 59)), true);
  assert.equal(isOpen('equipment', clockAt(18 * 60)), false, 'the shutters come down at six');
  assert.equal(isOpen('equipment', clockAt(3 * 60)), false);
  // **The tavern never shuts** — the owner's own law (2026-10-17: *"taverns shoud be always
  // open"*). Every hour of the day, checked hour by hour, because the law is exactly that.
  for (let hour = 0; hour < 24; hour++) {
    assert.equal(isOpen('tavern', clockAt(hour * 60)), true, `a tavern is open at ${hour}:00`);
  }
  assert.equal(isOpen('tavern', clockAt(23 * 60 + 59)), true, 'and at the last minute of the day');
  // The guild keeps an office day, the temple is open from before dawn.
  assert.equal(isOpen('mages', clockAt(9 * 60)), true);
  assert.equal(isOpen('mages', clockAt(17 * 60)), false);
  assert.equal(isOpen('temple', clockAt(6 * 60)), true);
  assert.equal(isOpen('temple', clockAt(20 * 60)), false);
  // A home is not a shop, and a kind nobody has heard of is never open.
  assert.equal(isOpen('house', clockAt(12 * 60)), false);
  assert.equal(isOpen('noble', clockAt(12 * 60)), false);
  assert.equal(isOpen('nonsense', clockAt(12 * 60)), false);
  assert.equal(isOpen(undefined, clockAt(12 * 60)), false);
  // A clock with no `minutes` is midnight, which is shut — never open by accident.
  assert.equal(isOpen('equipment', {}), false);
});

// ── the day each trade lives ──────────────────────────────────────────────────

test('every trade the game can draw has a plan, and the plan tiles all twenty-four hours', async () => {
  const trades = ['smith', 'bartender', 'wizard', 'priest', 'merchant', 'vendor', 'beggar',
    'performer', 'harlot', 'shady character', 'worker', 'noble', 'monk', 'man', 'woman'];
  for (const role of trades) {
    const plan = dayPlanFor(person({ role }), { day: 3, place: 'Daggerfall' });
    assert.ok(plan.length > 0, `${role} has a day`);
    let cursor = 0;
    for (const block of plan) {
      assert.equal(block.from, cursor, `${role}: ${block.activity} starts when the last one ended`);
      assert.ok(block.to > block.from, `${role}: ${block.activity} lasts`);
      assert.ok(ACTIVITIES.includes(block.activity), `${role}: ${block.activity} is one of the eight`);
      assert.ok(block.where, `${role}: ${block.activity} is somewhere`);
      cursor = block.to;
    }
    // A day is written in minutes past midnight, and it has to close on 1440 of them.
    assert.equal(cursor, MINUTES_PER_DAY, `${role}: the plan runs to midnight`);
    assert.ok(plan.every((block) => block.to <= MINUTES_PER_DAY), `${role}: nothing runs past the day`);
    assert.equal(plan[0].from, 0, `${role}: and it starts at midnight`);
  }
  // A trade with nowhere to work still has a day: they wander.
  const beggar = dayPlanFor(person({ role: 'beggar' }), { day: 3 });
  assert.ok(beggar.some((block) => block.activity === 'wander'), 'a beggar has no shop to open');
});

test('the plan is deterministic for a person and a day, and jitters between people', async () => {
  const a = person({ role: 'smith' });
  const b = person({ role: 'smith', home: { row: 40, col: 3 }, armour: 'leather' });
  assert.deepEqual(dayPlanFor(a, { day: 5 }), dayPlanFor(a, { day: 5 }), 'the same person, the same day');
  assert.notDeepEqual(dayPlanFor(a, { day: 5 }), dayPlanFor(b, { day: 5 }),
    'two smiths do not open their doors on the same minute');
  // A person's trade can come from the building they keep (`person.shop.kind`) when their own
  // armour word does not name one.
  assert.equal(roleOf({ shop: { kind: 'tavern' } }), 'bartender');
  assert.equal(roleOf({ role: 'priest', shop: { kind: 'tavern' } }), 'priest', 'their own trade wins');
});

test('what a person is doing right now is one of their own plan\'s blocks', async () => {
  const smith = person({ role: 'smith' });
  // The same day the clock below carries: a plan is drawn per person *and* per day.
  const plan = dayPlanFor(smith, { day: 1 });
  for (const hour of [0, 5, 8, 12, 15, 19, 22]) {
    const now = currentActivity(smith, clockAt(hour * 60));
    const block = plan.find((entry) => entry.from <= hour * 60 && hour * 60 < entry.to);
    assert.ok(block, `hour ${hour} is inside the plan`);
    assert.equal(now.activity, block.activity, `hour ${hour}: ${now.activity}`);
    assert.equal(now.where, block.where);
    assert.ok(now.since <= hour * 60 && now.until > hour * 60, 'the block brackets the hour');
  }
  // A smith keeps the shop through the morning, and is abed at three.
  assert.equal(currentActivity(smith, clockAt(11 * 60)).activity, 'openShop');
  assert.equal(currentActivity(smith, clockAt(11 * 60)).where, 'the shop');
  assert.equal(currentActivity(smith, clockAt(3 * 60)).activity, 'sleep');
  // …and the word the HUD prints is a sentence rather than the enum.
  assert.match(activityWord(smith, clockAt(11 * 60)), /keeping the shop/i);
});

test('a person walks toward their own trade, and comes home at night', async () => {
  const smith = person({ role: 'smith' });
  const doors = [
    { row: 3, col: 4, kind: 'equipment', name: 'the smithy' },
    { row: 30, col: 30, kind: 'tavern', name: 'the tavern' },
  ];
  const atWork = streetGoal(smith, clockAt(11 * 60), { doors });
  assert.equal(atWork?.row, 3, 'the smithy they keep');
  assert.equal(atWork?.reason, 'to open the shop');
  assert.equal(atWork?.col, 4);
  const atNight = streetGoal(smith, clockAt(2 * 60), { doors });
  assert.equal(atNight?.row, smith.home.row, 'home, which is a cell and not a doorway');
  assert.equal(atNight?.col, smith.home.col);
  // The same person at the same clock always gives the same answer, wherever they stand: the
  // distance is measured from their home, so a walker does not turn round halfway.
  assert.deepEqual(streetGoal({ ...smith, world: { x: 900, z: 900 } }, clockAt(11 * 60), { doors }), atWork);
  // No doors at all is a real town in this port's own data, and the answer is their street.
  assert.equal(streetGoal(smith, clockAt(11 * 60), { doors: [] })?.row, smith.home.row);
  // A person the town never gave a cell still walks to a door of the kind their trade needs —
  // the doc's own rule is that a town with doors always has somewhere to send them, and null
  // is reserved for a town with neither doors nor a home cell.
  assert.equal(streetGoal({ role: 'smith' }, clockAt(11 * 60), { doors })?.reason, 'to open the shop');
  assert.equal(streetGoal({ role: 'smith' }, clockAt(11 * 60), {}), null, 'nowhere to go at all');
});

// ── D-44: the people who never move ──────────────────────────────────────────────────────────
//
// The owner: *"you should add the npcs that dont move from the original arena the one in taverns
// the priest the ones you can ask rumors … they are probably object and not entities in the
// original arena"*. The trades that serve from a spot are fixtures on Arena's street, and this
// port walked them round the town — measured 2026-10-17, a priest stood on 22 cells in twenty-one
// minutes. The law is one flag on the goal, and the flag is *data*: `POST_ACTIVITIES`.
test('a block that serves from a place is a post, and no other block is (D-44)', async () => {
  const doors = [
    { row: 3, col: 4, kind: 'equipment', name: 'the smithy' },
    { row: 30, col: 30, kind: 'tavern', name: 'the tavern' },
    { row: 12, col: 40, kind: 'temple', name: 'the temple' },
    { row: 20, col: 20, kind: 'mages', name: 'the Mages Guild' },
  ];
  // **The law over a whole day of every trade the town keeps**: a goal is a post exactly when the
  // block it came from is one. Neither side is guessed — both are read from the module, which is
  // what stops a reworded reason from quietly ending the law.
  for (const role of ['smith', 'bartender', 'priest', 'wizard', 'vendor', 'beggar', 'townsperson', 'harlot']) {
    for (let hour = 0; hour < 24; hour++) {
      const who = person({ role });
      const activity = currentActivity(who, clockAt(hour * 60)).activity;
      const goal = streetGoal(who, clockAt(hour * 60), { doors });
      assert.equal(Boolean(goal?.post), POST_ACTIVITIES.includes(activity),
        `${role} at ${hour}:00 — block ${activity}, post ${goal?.post}`);
    }
  }
  const smith = person({ role: 'smith' });
  assert.equal(streetGoal(smith, clockAt(11 * 60), { doors })?.post, true, 'a smith opening the shop stands at it');
  assert.equal(Boolean(streetGoal(smith, clockAt(2 * 60), { doors })?.post), false, 'and at home is not posted');
  // **A wanderer's beat is not a post** — wandering *is* the block — and neither is a patron's
  // drink: a customer comes and goes. Those are the two blocks a player would notice held still.
  const wanderer = person({ role: 'townsperson' });
  const beat = streetGoal(wanderer, clockAt(10 * 60), { doors });
  assert.equal(beat?.reason, 'to wander');
  assert.equal(Boolean(beat?.post), false);
  // The three serving blocks, named once, so a reader can see the whole law at a glance.
  assert.deepEqual([...POST_ACTIVITIES], ['openShop', 'work', 'worship']);
});

test('a wanderer\'s beat is a door of their own quarter, and never the paving they stand on', async () => {
  // A townsperson at ten in the morning is wandering (`the street`), which is the trade with
  // no shop to keep. Their beat is drawn from the doors **nearest their home**, so a wanderer
  // strolls their own quarter instead of setting off across the city — the first version drew
  // from every door in the settlement, and a city's wanderer walked seventy cells to a doorway
  // on the far side of it, which no player ever saw finish and which left the near streets empty.
  const wanderer = person({ role: 'townsperson' });
  assert.equal(currentActivity(wanderer, clockAt(10 * 60)).activity, 'wander', 'ten is a wanderer\'s hour');
  // Twelve doors within a few cells of home {10,12}, and a hundred far ones: the far ones are
  // the whole rest of the city, and a beat drawn from them is the defect this test is for.
  const doors = [
    ...Array.from({ length: WANDER_BEATS }, (_, i) => ({ row: 10 + (i % 4) - 1, col: 12 + Math.floor(i / 4), kind: 'equipment' })),
    ...Array.from({ length: 100 }, (_, i) => ({ row: 80 + (i % 10), col: 80 + Math.floor(i / 10), kind: 'tavern' })),
  ];
  const beat = streetGoal(wanderer, clockAt(10 * 60), { doors });
  assert.equal(beat?.reason, 'to wander');
  assert.ok(beat.row >= 9 && beat.row <= 12 && beat.col >= 12 && beat.col <= 14,
    `the beat is in the quarter they live in, not across the city: ${JSON.stringify(beat)}`);
  assert.ok(beat.row !== wanderer.home.row || beat.col !== wanderer.home.col,
    'and it is somewhere, not the cell they are standing on');
  // The same person, the same day, the same beat — a crowd that reshuffled every reload would
  // be a crowd, not a town.
  assert.deepEqual(streetGoal(wanderer, clockAt(10 * 60), { doors }), beat);
  // **A person whose beat would be their own cell is moved along**, not left standing: the draw
  // is deterministic, so "the nearest door is where I am" would be a person who never walks
  // again, for the rest of the day.
  const oneDoor = [{ row: wanderer.home.row, col: wanderer.home.col, kind: 'equipment' },
    { row: wanderer.home.row + 3, col: wanderer.home.col + 2, kind: 'equipment' }];
  const moved = streetGoal(wanderer, clockAt(10 * 60), { doors: oneDoor });
  assert.deepEqual([moved.row, moved.col], [wanderer.home.row + 3, wanderer.home.col + 2],
    'the beat is the other door rather than the paving under their feet');
  // With *only* their own cell to stand on, the answer is a cell and not a doorway, and it is
  // their own street — never null, which is reserved for a person the town placed nowhere.
  const stuck = streetGoal(wanderer, clockAt(10 * 60), { doors: [{ row: wanderer.home.row, col: wanderer.home.col }] });
  assert.equal(stuck?.reason, 'their own street');
  assert.deepEqual([stuck.row, stuck.col], [wanderer.home.row, wanderer.home.col]);
});

test('a wanderer given the level\'s own grid draws a beat a few paces from home, and can stand on it', async () => {
  // The scene hands the wanderer the grid the walk is planned over (`streetGoal`'s `opts.nav`,
  // `game/townPaths.js`'s `townGrid`), and then the beat is **a place, not a shop**: a cell
  // within `WANDER_STEPS` of their own home. A city's doors are sparse — 54 of them over 128×128
  // cells in Daggerfall — so drawing from the twelve doors nearest home still sent wanderers
  // thirty cells across the city (`(2,14) → (9,51)` in the running game), and a beat that far off
  // is a journey a player watches for half a minute.
  const wanderer = person({ role: 'townsperson' });
  // An open field with a wall through it: the grid says which cells exist, and the beat has to
  // be one of the open ones (a beat inside a wall is a person walking into stone).
  const open = (row, col) => row >= 0 && col >= 0 && row < 128 && col < 128 && col !== wanderer.home.col + 3;
  const nav = { width: 128, depth: 128, open };
  const beat = streetGoal(wanderer, clockAt(10 * 60), { doors: [], nav });
  assert.equal(beat?.reason, 'to wander');
  const steps = Math.abs(beat.row - wanderer.home.row) + Math.abs(beat.col - wanderer.home.col);
  assert.ok(steps > 0, 'the beat is somewhere, not the cell under their feet');
  assert.ok(steps <= 2 * WANDER_STEPS, `a few paces, not a journey: ${JSON.stringify(beat)} is ${steps} cells off`);
  assert.ok(open(beat.row, beat.col), 'and a cell the level says a person can stand on');
  assert.deepEqual(streetGoal(wanderer, clockAt(10 * 60), { doors: [], nav }), beat,
    'the same person on the same day draws the same beat');
  // A person walled in on every side gets their own cell back rather than a beat inside a wall,
  // and the scene's own idle step is what paces them from there.
  const walled = streetGoal(wanderer, clockAt(10 * 60), { doors: [], nav: { width: 128, depth: 128, open: () => false } });
  assert.deepEqual([walled.row, walled.col], [wanderer.home.row, wanderer.home.col]);
  assert.equal(walled.reason, 'their own street');
});

test('the frame\'s own question: one row per person, and the roster is not mutated', async () => {
  const smith = person({ role: 'smith' });
  const door = [{ row: 3, col: 4, kind: 'equipment' }];
  const rows = scheduleMoves([smith], clockAt(11 * 60), { doors: door, place: 'Daggerfall' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].activity, 'openShop', 'the smith is keeping the shop at eleven');
  assert.equal(rows[0].where, 'the shop');
  assert.equal(rows[0].goal?.row, 3);
  assert.match(rows[0].id ?? '', /^Daggerfall#/, 'the id is the ledger\'s own key when a place is named');
  assert.equal(scheduleMoves([smith], clockAt(11 * 60), {}).length, 1, 'no doors is still a row');
  // The dead are not scheduled, and the roster handed in is never touched.
  const fallen = { ...person({ role: 'smith' }), down: true };
  assert.equal(scheduleMoves([fallen], clockAt(11 * 60), {}).length, 0, 'a body does not walk');
  assert.deepEqual(smith.world ?? null, null, 'nothing was written onto the person');
});

// ── the watch ─────────────────────────────────────────────────────────────────

test('a crime nobody saw brings nobody, and every crime is answered as its own strength', async () => {
  assert.equal(watchDecision({ crime: 'murder', witnesses: 0, guardNear: false }).respond, false);
  assert.match(watchDecision({ crime: 'murder', witnesses: 0, guardNear: false }).reason, /nobody saw it/);
  assert.equal(watchDecision({ crime: 'none', witnesses: 9 }).respond, false);
  assert.equal(watchDecision({}).respond, false);
  // A murder in a watchman's sight is an arrest, and the arrest costs regard of its own.
  const arrest = watchDecision({ crime: 'murder', witnesses: 2, guardNear: true });
  assert.equal(arrest.action, 'arrest');
  assert.ok(arrest.regardDelta < 0, `the guardhouse tells the street who you are: ${arrest.regardDelta}`);
  // The same murder with no watchman there is the watch coming armed.
  assert.equal(watchDecision({ crime: 'murder', witnesses: 2, guardNear: false }).action, 'attack');
  assert.equal(watchDecision({ crime: 'assault', witnesses: 1, guardNear: false }).action, 'attack');
  // A stolen purse is a warning, whoever saw it.
  assert.equal(watchDecision({ crime: 'theft', witnesses: 1, guardNear: false }).action, 'warn');
  assert.equal(watchDecision({ crime: 'theft', witnesses: 1, guardNear: true }).action, 'warn');
  assert.equal(watchDecision({ crime: 'theft', witnesses: 1, guardNear: false }).regardDelta, 0);
  // A crime that is not in the table is not invented into one.
  assert.equal(watchDecision({ crime: 'littering', witnesses: 5 }).respond, false);
});

test('the squad is the crime\'s own count, capped, and a street at its cap sends nobody', async () => {
  const first = watchSpawn({ crime: 'murder', guards: 0, day: 1, seed: 20232 });
  assert.ok(first.count >= CRIME_RESPONSE.murder.count && first.count <= WATCH_MAX, `${first.count} answer a murder`);
  assert.equal(first.action, 'attack');
  assert.match(first.note, /come at a run/);
  const theft = watchSpawn({ crime: 'theft', guards: 0, day: 1, seed: 7 });
  assert.equal(theft.action, 'warn');
  assert.match(theft.note, /saw it/);
  // The cap: already at it, nothing more comes — which is what stops a fresh squad every murder.
  const full = watchSpawn({ crime: 'murder', guards: WATCH_MAX, day: 1, seed: 9 });
  assert.equal(full.count, 0);
  assert.equal(full.action, 'none');
  assert.match(full.note, /no more to send/);
  const nearly = watchSpawn({ crime: 'murder', guards: WATCH_MAX - 1, day: 4, seed: 3 });
  assert.ok(nearly.count <= 1, `${nearly.count} answers, one seat left`);
  // Two murders on different days are not the same squad, and the same day is the same squad.
  assert.deepEqual(watchSpawn({ crime: 'murder', guards: 0, day: 2, seed: 11 }), watchSpawn({ crime: 'murder', guards: 0, day: 2, seed: 11 }));
  assert.equal(watchSpawn({ crime: 'murder', guards: 0, day: 2, seed: 11 }).count <= WATCH_MAX, true);
  // Nothing the watch does not know about is answered at all.
  assert.equal(watchSpawn({ crime: 'none', guards: 0 }).count, 0);
});

test('the watch keeps shifts, and one rest day in seven', async () => {
  assert.ok(WATCH_ROTATION >= 3, 'a watch has more than two shifts to rotate');
  const guard = person({ role: 'knight' });
  const shifts = [0, 1, 2, 3, 4, 5, 6, 7].map((day) => watchShift(guard, day));
  assert.ok(shifts.some((shift) => shift.onDuty === false), `${JSON.stringify(shifts[0])}: the watch is not on duty every day`);
  assert.ok(shifts.filter((shift) => shift.onDuty).length >= 4, 'and it is on duty most days');
  assert.equal(offDay(guard, 1), offDay(guard, 1), 'a rest day is deterministic');
});

// ── the clock does not invent a calendar ──────────────────────────────────────

test('the clock reports how far it has rolled, and never moves the world\'s day itself', async () => {
  const late = timeOfDay(12, SECONDS_PER_DAY, { opensAt: 0 });
  assert.equal(late.day, 12, 'the world\'s day is the caller\'s, untouched');
  assert.equal(late.turned, 1, 'and the level\'s own clock says it has been standing a day');
  assert.equal(timeOfDay(1, -50, { opensAt: 0 }).minutes, 0, 'a negative clock is clamped, not wrapped backwards');
});
