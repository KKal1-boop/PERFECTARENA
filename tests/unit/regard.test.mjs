// WHO THE WORLD THINKS YOU ARE.
//
// Two new things this file checks, and both of them are *rules* rather than plumbing:
//
//   * the **regard ledger** (`game/regard.js`) — the twin's living-world law, cut down to
//     what an Arena town can support. The questions worth asking are the ones a bug would
//     get wrong: does a word count once a day or fifty times? does a friendship nobody keeps
//     up actually fade? is an enemy past `ENEMY_AT` refused words and one past `HOSTILE_AT`
//     armed? does the record survive a save?
//   * the **hand-in** — a job given by a person is paid by that person, and a job off the
//     world map's board is the town's. Before this, a finished job could not be handed in at
//     all in normal play: `applyRadiantEvent`'s `return` existed and nothing fired it.
//
// Run:  node --test tests/unit/regard.test.mjs     (needs ARENA_PATH for the hand-in half)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { loadArenaText } from '../../src/arena/arenaText.js';
import { loadWorldMap } from '../../src/game/worldMap.js';
import { discoverLooseMifs, enterableDungeons, enterableFromListing, personOffer, handInAtPlace, handInWith, applyRadiantEvent, createRadiantState, buildBoard, slayProgress } from '../../src/game/radiantQuests.js';
import {
  EASE_PER_DAY, ENEMY_AT, FRIEND_AT, HOSTILE_AT, PEOPLE_MAX, REGARD_EVENTS, REGARD_MAX,
  createRegardRecord, deserializeRegard, knowsPerson, noteRegard, peopleKnown, personId,
  regardOf, regardTally, serializeRegard, standingOf, standingWord,
} from '../../src/game/regard.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const folder = () => nodeSource(ARENA);
const data = () => new ArenaData(folder(), { onWarn: () => {} });

const ID = 'Daggerfall#12,7';
/** Apply one event and hand back the ledger, the way a scene does. */
const note = (record, id, event, day) => noteRegard(record, id, event, day).record;

// ── the key ───────────────────────────────────────────────────────────────────

test('a person is their town and the cell they were placed on', () => {
  assert.equal(personId('Daggerfall', { row: 12, col: 7 }), ID);
  assert.equal(personId('Daggerfall', { row: 12.9, col: 7.4 }), ID, 'a cell is a cell, not a place in it');
  assert.equal(personId('  Sentinel  ', { row: 0, col: 0 }), 'Sentinel#0,0');
  // Nothing to name them by is *nothing*, never a shared `undefined#NaN,NaN` that would make
  // every unnamed person in the world the same person.
  assert.equal(personId(null, { row: 1, col: 2 }), null);
  assert.equal(personId('Daggerfall', null), null);
  assert.equal(personId('Daggerfall', { row: NaN, col: 2 }), null);
  assert.equal(personId('', { row: 1, col: 2 }), null);
});

// ── the law ───────────────────────────────────────────────────────────────────

test('a stranger reads nothing, and a word is worth a little', () => {
  const empty = createRegardRecord();
  assert.equal(regardOf(empty, ID, 1), 0);
  assert.equal(standingOf(empty, ID, 1), 'neutral');
  assert.equal(knowsPerson(empty, ID), false);

  const after = noteRegard(empty, ID, 'talk', 1);
  assert.equal(after.delta, REGARD_EVENTS.talk);
  assert.equal(after.regard, 3);
  assert.equal(after.standing, 'neutral', 'one word is not a friendship');
  assert.equal(knowsPerson(after.record, ID), true);
});

test('a word counts ONCE A DAY, and the ledger says so', () => {
  // The rule that makes a regard a regard: without it, pressing T fifty times at one
  // stranger buys a friendship, and a friendship bought with a keypress is nothing.
  let record = createRegardRecord();
  for (let i = 0; i < 50; i++) record = note(record, ID, 'talk', 1);
  assert.equal(regardOf(record, ID, 1), REGARD_EVENTS.talk, 'fifty words in one day are one word');

  // The next day is another — less the half point the day apart eased off (`EASE_PER_DAY`),
  // which is the twin's own rule and the reason a regard is a *kept* thing.
  record = note(record, ID, 'talk', 2);
  assert.equal(regardOf(record, ID, 2), REGARD_EVENTS.talk * 2 - EASE_PER_DAY);
  // The ration is per person, not per world: somebody else's word still counts.
  const other = note(record, 'Sentinel#1,1', 'talk', 2);
  assert.equal(regardOf(other, 'Sentinel#1,1', 2), REGARD_EVENTS.talk);
});

test('a friendship nobody keeps up fades, and so does a quarrel', () => {
  let record = createRegardRecord();
  for (let day = 1; day <= 20; day++) record = note(record, ID, 'talk', day);
  const kindled = regardOf(record, ID, 20);
  // Twenty days of words, less the half point each day apart cost: 60 − 19×0.5.
  assert.equal(kindled, REGARD_EVENTS.talk * 20 - 19 * EASE_PER_DAY, 'twenty days of words');
  // A year later it is gone — and it went *to* nothing rather than past it.
  assert.equal(regardOf(record, ID, 20 + 365), 0);
  assert.equal(standingOf(record, ID, 20 + 365), 'neutral');
  // Ten days apart: 5 points of the 60 eases off.
  assert.equal(regardOf(record, ID, 30), kindled - 10 * EASE_PER_DAY);
  // A negative regard climbs back the same way, and never crosses zero either.
  const crossed = note(createRegardRecord(), ID, 'struck', 1);
  assert.equal(regardOf(crossed, ID, 1), REGARD_EVENTS.struck);
  assert.equal(regardOf(crossed, ID, 1 + 1000), 0);
});

test('the thresholds are the twin\'s, and the words are the game\'s', () => {
  const record = note(createRegardRecord(), ID, 'talk', 1);
  // Built up to exactly a friend with the strongest good turn the game has.
  let warm = createRegardRecord();
  warm = note(warm, ID, 'job', 1);
  assert.equal(regardOf(warm, ID, 1), REGARD_EVENTS.job);
  // Six days of words on top of the job: the errand plus a week of talk is a friendship.
  for (let i = 0; i < 6; i++) warm = note(warm, ID, 'talk', 1 + i);
  assert.ok(regardOf(warm, ID, 6) >= FRIEND_AT, `${regardOf(warm, ID, 6)} is past FRIEND_AT`);
  assert.equal(standingOf(warm, ID, 6), 'friend');
  assert.equal(standingWord('friend'), 'a friend');

  let cold = note(createRegardRecord(), ID, 'struck', 1);
  assert.ok(regardOf(cold, ID, 1) <= ENEMY_AT, 'one blow is an enemy: no words for you');
  assert.equal(standingOf(cold, ID, 1), 'enemy');
  assert.equal(standingWord('enemy'), 'an enemy');
  cold = note(cold, ID, 'struck', 1);
  assert.ok(regardOf(cold, ID, 1) <= HOSTILE_AT, 'two blows is an armed enemy');
  assert.equal(standingOf(cold, ID, 1), 'hostile');
  assert.match(standingWord('hostile'), /armed/);
  assert.equal(record.people[ID].r, REGARD_EVENTS.talk, 'and none of this touched anybody else');
});

test('regard is clamped, and an unknown act is not silently worth something', () => {
  let record = createRegardRecord();
  for (let i = 0; i < 40; i++) record = note(record, ID, 'job', i);
  assert.equal(regardOf(record, ID, 39), REGARD_MAX);
  let low = createRegardRecord();
  for (let i = 0; i < 40; i++) low = note(low, ID, 'slain', i);
  assert.equal(regardOf(low, ID, 39), -100);
  const nothing = noteRegard(record, ID, 'not-an-act', 40);
  assert.equal(nothing.delta, 0);
  assert.equal(nothing.record, record, 'and nothing was written');
});

test('the ledger forgets the faintest and the longest unseen first', () => {
  let record = createRegardRecord();
  // 400 people, each one word: past the cap. The oldest are the faintest *as they stand*,
  // because the same three points have been easing for longer.
  for (let i = 0; i < PEOPLE_MAX + 100; i++) record = note(record, `Town${i}#1,1`, 'talk', 1);
  const kept = Object.keys(record.people);
  assert.equal(kept.length, PEOPLE_MAX, 'the cap holds');
  assert.ok(kept.includes(`Town${PEOPLE_MAX + 99}#1,1`), 'the one just noted is always kept');
  assert.ok(!kept.includes('Town0#1,1'), 'and the faintest, longest-unseen went');
});

test('the record survives a save, and a corrupt one is simply empty', () => {
  let record = createRegardRecord();
  record = note(record, ID, 'job', 3);
  record = note(record, 'Sentinel#9,2', 'struck', 4);
  const back = deserializeRegard(JSON.parse(JSON.stringify(serializeRegard(record))));
  assert.deepEqual(back, record, 'a round trip is the same ledger');
  assert.equal(regardOf(back, ID, 3), REGARD_EVENTS.job);
  for (const junk of [null, 42, 'nope', {}, { people: 'no' }, { people: { [ID]: { r: 'x' } } }]) {
    assert.deepEqual(deserializeRegard(junk), createRegardRecord(), `${JSON.stringify(junk)} is empty`);
  }
  // Junk *entries* are dropped and the good ones kept: one bad row does not lose the town.
  const mixed = deserializeRegard({ people: { [ID]: { r: 10 }, bad: 'x', also: { r: NaN } } });
  assert.deepEqual(Object.keys(mixed.people), [ID]);
});

test('the journal page reads the ledger by standing and by recency', () => {
  let record = createRegardRecord();
  // One friend (a job and a week of words), one acquaintance, one enemy (twice struck).
  record = note(record, 'A#1,1', 'job', 1);
  for (let day = 1; day <= 6; day++) record = note(record, 'A#1,1', 'talk', day);
  record = note(record, 'B#2,2', 'talk', 2);
  record = note(record, 'C#3,3', 'struck', 3);
  record = note(record, 'C#3,3', 'struck', 3);
  const page = peopleKnown(record, 6, { min: 0, limit: 10 });
  // The strongest regard first: the man the player robbed of a friend, then the friend, then
  // the stranger who was thanked once.
  assert.deepEqual(page.map((p) => p.id), ['C#3,3', 'A#1,1', 'B#2,2'], 'the ones who matter most, first');
  assert.deepEqual(page.map((p) => p.standing), ['hostile', 'friend', 'neutral']);
  assert.deepEqual(page.map((p) => p.place), ['C', 'A', 'B']);
  const tally = regardTally(record, 6);
  assert.deepEqual(tally, { known: 3, friends: 1, enemies: 0, hostile: 1 });
  // A page can be asked for only the ones that *matter*: `min` is a floor on |regard|.
  assert.deepEqual(peopleKnown(record, 6, { min: 20 }).map((p) => p.id), ['C#3,3', 'A#1,1']);
  assert.deepEqual(record.people['B#2,2'].met, 2, 'and the day they were met is kept');
});

// ── the hand-in ───────────────────────────────────────────────────────────────

const world = await loadWorldMap(data());
const library = await loadArenaText(data());
const loose = await discoverLooseMifs(folder());
const dungeons = enterableDungeons(world, enterableFromListing(loose));
const giver = world.settlements().find((s) => s.name && s.kind !== 'dungeon');

test('a job given by a person carries the person who is owed for it', () => {
  const person = { description: 'a person in chain mail', armour: 'CHN', place: { row: 20, col: 9 } };
  const offer = personOffer({ world, library, giver, person, day: 4, dungeons });
  assert.ok(offer, 'this person has work');
  assert.equal(offer.giverId, personId(giver.name, person.place));
  assert.equal(offer.giverPerson, 'a person in chain mail');
  assert.equal(offer.giver, giver.name, 'and the town is still named, as it was');

  // The id is drawn from the cell they were **placed** on, so a conversation that began
  // after they walked to the next cell hands back the same job and the same giver.
  const walked = { ...person, home: { row: 20, col: 9 }, place: { row: 21, col: 10 } };
  const again = personOffer({ world, library, giver, person: walked, day: 4, dungeons });
  assert.equal(again.giverId, offer.giverId);
  assert.equal(again.title, offer.title, 'a person who walked away offers the same work');
});

test('a finished job is paid by the one who asked, and by nobody else', () => {
  const person = { description: 'a person in robes', armour: 'MAG', place: { row: 4, col: 4 } };
  const offer = personOffer({ world, library, giver, person, day: 2, dungeons });
  assert.ok(offer?.giverId);
  let state = applyRadiantEvent(createRadiantState(), 'accept', { offer }).state;
  const finish = { artifact: 'found', fetch: 'found', slay: 'killed', rescue: 'rescue', deliver: 'deliver' }[offer.kind];
  if (offer.kind === 'slay') {
    const progress = slayProgress(state.active);
    for (const encounterId of progress.ids) state = applyRadiantEvent(state, 'killed', {
      where: offer.target, questId: offer.id, monster: progress.monster, encounterId,
    }).state;
  } else state = applyRadiantEvent(state, finish, { where: offer.target }).state;
  assert.equal(state.active.completed, true);

  assert.equal(handInWith(state, offer.giverId)?.id, offer.id, 'this person is the one owed');
  assert.equal(handInWith(state, 'Nowhere#0,0'), null, 'a stranger owes nothing');
  assert.equal(handInAtPlace(state, giver.name), null, 'and the town does not pay a person\'s job');

  // The town is not enough: the reward waits with the one who asked.
  assert.equal(applyRadiantEvent(state, 'return', { where: giver.name }).ok, false, 'missing speaker identity cannot collect a personal reward');
  const wrongPerson = applyRadiantEvent(state, 'return', { where: giver.name, personId: 'Nowhere#0,0' });
  assert.equal(wrongPerson.ok, false);
  assert.match(wrongPerson.reason, /the one who asked|person in robes/);

  const paid = applyRadiantEvent(state, 'return', { where: giver.name, personId: offer.giverId });
  assert.equal(paid.ok, true, paid.reason ?? '');
  assert.equal(paid.gold, offer.reward);
  assert.equal(paid.state.active, null);
  assert.equal(paid.state.taken, 1);
  assert.match(paid.state.log.at(-1), /a person in robes/, 'and the journal says who paid');
});

test('a job off the board is the town\'s, and the town pays it', () => {
  const board = buildBoard({ world, library, seed: 12345, giver, day: 1, dungeons });
  assert.ok(board.length, 'the board has work');
  const offer = board.find((o) => o.needsDungeon !== false && o.targetMif) ?? board[0];
  assert.equal(offer.giverId, undefined, 'a posted job has nobody behind it');
  let state = applyRadiantEvent(createRadiantState(), 'accept', { offer }).state;
  const finish = { artifact: 'found', fetch: 'found', slay: 'killed', rescue: 'rescue', deliver: 'deliver' }[offer.kind];
  if (offer.kind === 'slay') {
    const progress = slayProgress(state.active);
    for (const encounterId of progress.ids) state = applyRadiantEvent(state, 'killed', {
      where: offer.target, questId: offer.id, monster: progress.monster, encounterId,
    }).state;
  } else state = applyRadiantEvent(state, finish, { where: offer.target }).state;

  assert.equal(handInAtPlace(state, giver.name)?.id, offer.id);
  assert.equal(handInAtPlace(state, 'Somewhere Else'), null, 'a different town owes nothing');
  assert.equal(handInWith(state, 'Daggerfall#1,1'), null, 'no person is owed for it');
  const paid = applyRadiantEvent(state, 'return', { where: giver.name });
  assert.equal(paid.ok, true, paid.reason ?? '');
  assert.equal(paid.state.gold, offer.reward);
});

test('doing somebody\'s work is the strongest good turn the game has', () => {
  // The loop the whole hand-in exists for: the job moves the regard, and a regard of 40 is
  // a friend — so one errand plus a few words makes the man who asked glad to see the player.
  let record = createRegardRecord();
  const id = personId('Daggerfall', { row: 6, col: 6 });
  record = note(record, id, 'job', 1);
  assert.equal(regardOf(record, id, 1), REGARD_EVENTS.job);
  for (let day = 2; day <= 7; day++) record = note(record, id, 'talk', day);
  assert.equal(regardOf(record, id, 7), REGARD_EVENTS.job + REGARD_EVENTS.talk * 6 - 6 * EASE_PER_DAY,
    'the job, six days of words, and the half point a day apart cost');
  assert.equal(standingOf(record, id, 7), 'friend');
});
