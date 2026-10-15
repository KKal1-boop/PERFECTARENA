// Run:  node --test tests/unit/worldstate.test.mjs
//
// The world the player has changed (`src/game/worldState.js`) — the record `save.js` carries
// beside the character and the quest. It is pure data and pure functions, so its laws can be
// held here without a browser, and the laws that matter are the ones a scene depends on:
//
//   * a door the player opened **stays open** across a save and a load;
//   * a thing taken is gone for good — the second call is refused;
//   * a kill is a count, per place and per kind;
//   * a place remembers how often it was visited and the first and last day of it;
//   * every collection is **capped**, oldest first, so a long game cannot grow a save forever;
//   * `parseWorld` answers a valid world for `null`, `'x'`, `[]`, a future version and a
//     truncated object — a corrupt save is a fresh world, never a scene that will not boot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDINGS, WORLD_ENTRY_MAX, WORLD_PEOPLE_MAX, WORLD_PLACE_MAX, WORLD_STATE_VERSION,
  createWorldState, doorStateAt, lootTakenAt, noteKill, parseWorld, serializeWorld, setDoorState,
  setQuest, setRegard, takeLoot, visitPlace, worldSummary,
} from '../../src/game/worldState.js';

// ── a fresh world ─────────────────────────────────────────────────────────────

test('a fresh world is empty, versioned, and plain JSON', async () => {
  const world = createWorldState();
  assert.equal(world.version, WORLD_STATE_VERSION);
  assert.deepEqual(Object.keys(world).sort(), ['clock', 'doors', 'kills', 'loot', 'player', 'quests', 'regard', 'visited', 'weather', 'version'].sort());
  assert.deepEqual(world.visited, {});
  assert.equal(world.clock, null);
  assert.equal(world.weather, null);
  assert.equal(world.player, null);
  // Nothing in it is a class instance or a function: the round trip is `JSON.stringify` and
  // back, and that is the whole reason the record exists.
  assert.equal(JSON.parse(JSON.stringify(world)).version, WORLD_STATE_VERSION);
  assert.deepEqual(worldSummary(world), { places: 0, doors: 0, loot: 0, kills: 0, quests: 0, people: 0, clock: null });
});

// ── where the player has been ─────────────────────────────────────────────────

test('a place remembers how often it was visited, and the first and last day of it', async () => {
  const world = createWorldState();
  const first = visitPlace(world, 'city:Daggerfall', 'a city', 1);
  assert.equal(first.count, 1);
  assert.equal(first.firstDay, 1);
  assert.equal(first.lastDay, 1);
  assert.equal(first.note, 'a city');
  const again = visitPlace(world, 'city:Daggerfall', null, 4);
  assert.equal(again.count, 2, 'the second visit counts');
  assert.equal(again.firstDay, 1, 'the first day is kept');
  assert.equal(again.lastDay, 4, 'and the last is the later one');
  assert.equal(again.note, 'a city', 'a caller with no note does not erase the one that is there');
  // A caller with no clock at all still gets a count, which is what is always known.
  const undated = visitPlace(world, 'dungeon:Stonekeep');
  assert.equal(undated.count, 1);
  assert.equal(undated.firstDay, null);
  assert.equal(undated.lastDay, null);
  // Two places are two places.
  assert.equal(worldSummary(world).places, 2);
  // …and a place key that is not a string is a key, not a crash.
  assert.equal(visitPlace(world, null).count, 1);
  assert.equal(Object.hasOwn(world.visited, ''), true);
});

// ── the doors the player opened ───────────────────────────────────────────────

test('a door the player opened is still open after a save and a load', async () => {
  const world = createWorldState();
  const door = setDoorState(world, 'city:Daggerfall', { row: 42, col: 17 }, { open: true, locked: true, lockLevel: 3 });
  assert.deepEqual(door, { open: true, locked: true, lockLevel: 3 });
  assert.deepEqual(doorStateAt(world, 'city:Daggerfall', { row: 42, col: 17 }), { open: true, locked: true, lockLevel: 3 });
  // A door this world never touched is unknown, not shut: `null` is what lets a scene use the
  // level's own lock data and only override it where the player has been.
  assert.equal(doorStateAt(world, 'city:Daggerfall', { row: 1, col: 1 }), null);
  assert.equal(doorStateAt(world, 'city:Elsewhere', { row: 42, col: 17 }), null);
  // The round trip: the loaded world knows the door, and the door is open.
  const loaded = parseWorld(JSON.parse(JSON.stringify(serializeWorld(world))));
  assert.deepEqual(doorStateAt(loaded, 'city:Daggerfall', { row: 42, col: 17 }), { open: true, locked: true, lockLevel: 3 });
  // **The spellings are one entry.** A scene holding a pair and a scene holding a string must
  // not disagree, or a door opened by one is shut to the other.
  assert.deepEqual(doorStateAt(loaded, 'city:Daggerfall', '42,17'), { open: true, locked: true, lockLevel: 3 });
  assert.deepEqual(doorStateAt(loaded, 'city:Daggerfall', [42, 17]), { open: true, locked: true, lockLevel: 3 });
  // The answer is a copy: writing through it does not edit the world behind `setDoorState`.
  const answer = doorStateAt(loaded, 'city:Daggerfall', '42,17');
  answer.open = false;
  assert.equal(doorStateAt(loaded, 'city:Daggerfall', '42,17').open, true);
  // Garbage in is a shut, unlocked door rather than a throw, and no cell at all is no entry.
  assert.deepEqual(setDoorState(world, 'city:Daggerfall', '7,7', { open: 1, lockLevel: -4 }), { open: true, locked: false, lockLevel: 0 });
  assert.equal(setDoorState(world, 'city:Daggerfall', 'not a cell', {}), null);
  assert.equal(setDoorState(world, 'city:Daggerfall', undefined, {}), null);
});

test('a door shut again by the player is recorded shut, and the level own lock is not lost', async () => {
  const world = createWorldState();
  setDoorState(world, 'START.MIF#0', '3,4', { open: true, locked: true, lockLevel: 4 });
  setDoorState(world, 'START.MIF#0', '3,4', { open: false, locked: true, lockLevel: 4 });
  assert.deepEqual(doorStateAt(world, 'START.MIF#0', '3,4'), { open: false, locked: true, lockLevel: 4 });
  // A door the player forced: open, and no longer locked — which is the difference between a
  // door that can be walked back through and one that has to be forced twice.
  setDoorState(world, 'START.MIF#0', '3,4', { open: true, locked: false, lockLevel: 4 });
  const forced = doorStateAt(world, 'START.MIF#0', '3,4');
  assert.equal(forced.locked, false);
  assert.equal(forced.lockLevel, 4, 'the lock level is a fact about the door, not about the forcing');
});

// ── what has been taken, killed, and who remembers it ─────────────────────────

test('a thing taken is gone for good: the second take is refused', async () => {
  const world = createWorldState();
  assert.equal(takeLoot(world, 'dungeon:Fang Lair', '11,2', 'a mithril key'), true);
  assert.equal(takeLoot(world, 'dungeon:Fang Lair', '11,2', 'a mithril key'), false, 'already gone');
  assert.equal(lootTakenAt(world, 'dungeon:Fang Lair', '11,2'), true);
  assert.equal(lootTakenAt(world, 'dungeon:Fang Lair', '11,3'), false, 'the next cell over is its own thing');
  assert.equal(lootTakenAt(world, 'dungeon:Stonekeep', '11,2'), false, 'and so is the next dungeon');
  // A refusal is not a crash, and a cell that is not a cell is never taken.
  assert.equal(takeLoot(world, 'dungeon:Fang Lair', 'nonsense', 'a chest'), false);
  assert.equal(takeLoot(world, null, null, 'a chest'), false);
  const loaded = parseWorld(serializeWorld(world));
  assert.equal(lootTakenAt(loaded, 'dungeon:Fang Lair', '11,2'), true);
  assert.equal(takeLoot(loaded, 'dungeon:Fang Lair', '11,2', 'again'), false, 'and the loaded world agrees');
});

test('kills count, per place and per kind', async () => {
  const world = createWorldState();
  assert.equal(noteKill(world, 'dungeon:Stonekeep', 'GOBLIN'), 1);
  assert.equal(noteKill(world, 'dungeon:Stonekeep', 'GOBLIN'), 2);
  assert.equal(noteKill(world, 'dungeon:Stonekeep', 'RAT'), 1);
  assert.equal(world.kills['dungeon:Stonekeep'].GOBLIN, 2);
  assert.equal(world.kills['dungeon:Stonekeep'].RAT, 1);
  // Another dungeon's dead are its own.
  assert.equal(noteKill(world, 'dungeon:Fang Lair', 'GOBLIN'), 1);
  // The summary counts creatures, not kinds.
  assert.equal(worldSummary(world).kills, 4);
  const loaded = parseWorld(serializeWorld(world));
  assert.equal(loaded.kills['dungeon:Stonekeep'].GOBLIN, 2, 'the count survives the round trip');
  assert.equal(worldSummary(loaded).kills, 4);
  // A monster with no id is still a kill, and not a key called `undefined`.
  assert.equal(noteKill(world, 'dungeon:Stonekeep', null), 1);
  assert.equal(world.kills['dungeon:Stonekeep'].something, 1);
});

test('a standing is one of three words, and a word nobody knows is neutral', async () => {
  const world = createWorldState();
  assert.equal(setRegard(world, 'Daggerfall#12,7', 'friendly'), 'friendly');
  assert.equal(setRegard(world, 'Daggerfall#12,8', 'hostile'), 'hostile');
  assert.equal(setRegard(world, 'Daggerfall#12,9', 'HOSTILE'), 'neutral', 'the words are case-sensitive and few');
  assert.equal(setRegard(world, 'Daggerfall#12,10', undefined), 'neutral');
  assert.deepEqual(STANDINGS, ['friendly', 'neutral', 'hostile']);
  assert.equal(worldSummary(world).people, 4);
  const loaded = parseWorld(serializeWorld(world));
  assert.deepEqual(loaded.regard['Daggerfall#12,7'], { standing: 'friendly' });
  assert.deepEqual(loaded.regard['Daggerfall#12,9'], { standing: 'neutral' });
  // A ledger saved the twin's way — the word itself rather than a record — is understood.
  const shorthand = parseWorld({ version: 1, regard: { 'Daggerfall#1,2': 'hostile' } });
  assert.equal(shorthand.regard['Daggerfall#1,2'].standing, 'hostile');
});

test('a quest record is a JSON-safe copy, and a state that cannot be copied is null', async () => {
  const world = createWorldState();
  const alive = { step: 3, pieces: 2, log: ['a'] };
  const record = setQuest(world, 'main', alive);
  assert.equal(record.id, 'main');
  assert.deepEqual(record.state, alive);
  // The copy is a copy: the live state moving on does not edit the world's record.
  alive.step = 9;
  alive.log.push('b');
  assert.equal(world.quests.main.state.step, 3);
  assert.deepEqual(world.quests.main.state.log, ['a']);
  // A live object with a method on it would produce a save that cannot be read back.
  const withMethod = { step: 4, start: () => 1 };
  setQuest(world, 'radiant:Daggerfall#3', withMethod);
  assert.deepEqual(world.quests['radiant:Daggerfall#3'].state, { step: 4 });
  setQuest(world, 'broken', undefined);
  assert.equal(world.quests.broken.state, null);
  const cyclic = { step: 1 };
  cyclic.self = cyclic;
  setQuest(world, 'cyclic', cyclic);
  assert.equal(world.quests.cyclic.state, null, 'a cycle is a null record, not a thrown save');
  assert.equal(worldSummary(world).quests, 4);
  const loaded = parseWorld(serializeWorld(world));
  assert.equal(loaded.quests.main.state.step, 3, 'and the record survives the round trip');
  assert.equal(loaded.quests.cyclic.state, null);
});

// ── bounded ───────────────────────────────────────────────────────────────────

test('the per-place caps hold, and the oldest entry is the one dropped', async () => {
  const world = createWorldState();
  for (let i = 0; i < WORLD_ENTRY_MAX + 25; i++) setDoorState(world, 'city:Daggerfall', `${i},0`, { open: true });
  const doors = world.doors['city:Daggerfall'];
  assert.equal(Object.keys(doors).length, WORLD_ENTRY_MAX, `the map is capped at ${WORLD_ENTRY_MAX}`);
  assert.equal(doorStateAt(world, 'city:Daggerfall', '0,0'), null, 'the door opened longest ago has left');
  assert.equal(doorStateAt(world, 'city:Daggerfall', `${WORLD_ENTRY_MAX + 24},0`)?.open, true, 'the newest is still here');
  // Loot and kills are bounded by the same rule, and a place map never grows past its own cap.
  for (let i = 0; i < WORLD_ENTRY_MAX + 10; i++) takeLoot(world, 'dungeon:Stonekeep', `${i},1`, 'a chest');
  assert.equal(Object.keys(world.loot['dungeon:Stonekeep']).length, WORLD_ENTRY_MAX);
  assert.equal(lootTakenAt(world, 'dungeon:Stonekeep', '0,1'), false);
  // The places themselves are capped, and the oldest place leaves first.
  for (let i = 0; i < WORLD_PLACE_MAX + 5; i++) noteKill(world, `place:${i}`, 'RAT');
  assert.equal(Object.keys(world.kills).length, WORLD_PLACE_MAX);
  assert.equal(Object.hasOwn(world.kills, 'place:0'), false, 'the first place remembered is gone');
  assert.equal(world.kills[`place:${WORLD_PLACE_MAX + 4}`].RAT, 1);
  // The ledger has the twin's own limit, and holds to it.
  for (let i = 0; i < WORLD_PEOPLE_MAX + 7; i++) setRegard(world, `Daggerfall#${i},0`, 'friendly');
  assert.equal(Object.keys(world.regard).length, WORLD_PEOPLE_MAX);
  assert.equal(Object.hasOwn(world.regard, 'Daggerfall#0,0'), false);
});

// ── a corrupt save is a fresh world ───────────────────────────────────────────

test('parseWorld answers a valid world for null, a string, an array and a future version', async () => {
  for (const garbage of [null, undefined, 'x', 42, true, [], [1, 2, 3], () => 1, NaN]) {
    const world = parseWorld(garbage);
    assert.equal(world.version, WORLD_STATE_VERSION, `${String(garbage)} is a fresh world`);
    assert.deepEqual(world.visited, {});
    assert.deepEqual(world.doors, {});
    assert.equal(world.clock, null);
  }
  // A version from a future build is **read**, not refused: what this build understands keeps
  // its meaning, and the fields it has never heard of are dropped like any other stranger.
  const future = parseWorld({
    version: 999,
    visited: { 'city:Daggerfall': { count: 3, firstDay: 1, lastDay: 9, note: 'a city' } },
    doors: { 'city:Daggerfall': { '5,5': { open: true } } },
    somethingNew: { whatever: true },
  });
  assert.equal(future.version, WORLD_STATE_VERSION);
  assert.equal(future.visited['city:Daggerfall'].count, 3);
  assert.equal(doorStateAt(future, 'city:Daggerfall', '5,5').open, true);
  assert.equal(Object.hasOwn(future, 'somethingNew'), false);
});

test('parseWorld survives a truncated or nonsense-filled object without losing what it knows', async () => {
  const truncated = parseWorld({
    version: 1,
    visited: { 'city:Daggerfall': { count: '2', firstDay: '1', lastDay: null } },
    doors: { 'city:Daggerfall': null, 'city:Wayrest': { '3,3': true } },
    loot: { 'dungeon:Stonekeep': { '1,1': { name: 'a chest' }, '1,2': null } },
    kills: { 'dungeon:Stonekeep': { RAT: '4' } },
  });
  assert.equal(truncated.visited['city:Daggerfall'].count, 2, 'a count written as a string is a count');
  assert.equal(truncated.visited['city:Daggerfall'].firstDay, 1);
  assert.equal(truncated.visited['city:Daggerfall'].lastDay, null);
  assert.equal(truncated.doors['city:Daggerfall'], undefined, 'a null place map is nothing, not a crash');
  assert.equal(doorStateAt(truncated, 'city:Wayrest', '3,3').open, true, 'a bare `true` is an open door');
  assert.equal(lootTakenAt(truncated, 'dungeon:Stonekeep', '1,1'), true);
  assert.equal(lootTakenAt(truncated, 'dungeon:Stonekeep', '1,2'), false);
  assert.equal(truncated.kills['dungeon:Stonekeep'].RAT, 4);
  // Nonsense inside the fields a scene writes itself.
  const messy = parseWorld({
    version: 'one',
    visited: 'not an object',
    doors: 5,
    loot: [],
    regard: { 'Daggerfall#1,1': { standing: 'warlike' } },
    quests: { main: 7 },
    clock: { day: '3', minutes: '480' },
    weather: 'snow',
    player: [],
  });
  assert.equal(messy.version, WORLD_STATE_VERSION);
  assert.deepEqual(messy.visited, {});
  assert.deepEqual(messy.doors, {});
  assert.deepEqual(messy.loot, {});
  assert.equal(messy.regard['Daggerfall#1,1'].standing, 'neutral', 'a word nobody knows is neutral');
  assert.deepEqual(messy.quests.main.state, 7);
  assert.deepEqual(messy.clock, { day: 3, minutes: 480 });
  assert.equal(messy.weather, null, 'a weather word is not a weather record');
  assert.equal(messy.player, null);
  // A clock that is not a clock at all is no clock.
  assert.equal(parseWorld({ clock: 'noon' }).clock, null);
  assert.equal(parseWorld({ clock: {} }).clock, null);
});

// ── the round trip ────────────────────────────────────────────────────────────

test('serialize then parse is an identity on everything the world can hold', async () => {
  const world = createWorldState();
  visitPlace(world, 'city:Daggerfall', 'a city', 2);
  visitPlace(world, 'city:Daggerfall', null, 5);
  visitPlace(world, 'dungeon:Stonekeep');
  setDoorState(world, 'city:Daggerfall', '9,9', { open: true, locked: false, lockLevel: 2 });
  takeLoot(world, 'city:Daggerfall', '4,4', 'a purse');
  noteKill(world, 'dungeon:Stonekeep', 'RAT');
  noteKill(world, 'dungeon:Stonekeep', 'RAT');
  setRegard(world, 'Daggerfall#12,7', 'friendly');
  setQuest(world, 'main', { step: 1, pieces: 0, log: ['Escaped.'] });
  world.clock = { day: 5, minutes: 480 };
  world.weather = { kind: 'rain', intensity: 0.4 };
  world.player = { place: 'Daggerfall', cell: '12,7' };
  const saved = serializeWorld(world);
  const loaded = parseWorld(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(loaded, saved, 'the loaded world is the saved world');
  assert.deepEqual(worldSummary(loaded), worldSummary(world));
  assert.deepEqual(worldSummary(loaded).clock, { day: 5, minutes: 480 });
  // The serialized copy is a copy: editing the live world afterwards does not edit the save, so
  // a scene cannot be writing the same object it already handed to storage.
  setDoorState(world, 'city:Daggerfall', '9,9', { open: false });
  assert.equal(doorStateAt(saved, 'city:Daggerfall', '9,9').open, true);
  // …and the same world serialized twice is the same bytes, which is what makes a save file
  // stable rather than dependent on the order a scene happened to touch it.
  assert.equal(JSON.stringify(serializeWorld(loaded)), JSON.stringify(saved));
});
