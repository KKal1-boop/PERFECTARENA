// THE MAIN QUEST: THE CHAIN, AND THE MACHINE THAT WALKS IT.
//
// `src/game/questData.js` claims the whole chain is *derived* from `CITYDATA.64` — the
// eight Staff pieces are the eight provinces' quest dungeons, each revealed by the other
// quest dungeon of the same province, in the order the game documents. That claim is
// checkable, so it is checked here against the real files rather than taken on trust:
//
//   * every one of the eight named dungeons is really its province's staff dungeon;
//   * every clue dungeon is really the *other* quest dungeon of the same province;
//   * each stage's `.MIF` is a file this install actually ships;
//   * the finale is the Imperial Palace, whose four levels each have their own `.INF`.
//
// Then the state machine, which is the part the game cannot get wrong: the eight pieces
// in order, the finale's mithril key, the Jewel of Fire it opens, and the Emperor freed
// — with every out-of-order or already-done transition refused, and the whole thing
// surviving a save/load round trip.
//
// Run:  node --test tests/unit/quest.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { loadWorldMap } from '../../src/game/worldMap.js';
import { discoverLooseMifs, enterableFromListing, enterableDungeons } from '../../src/game/radiantQuests.js';
import {
  FINAL_DUNGEON, STAGE_TEXT, START_DUNGEON, STAFF_DUNGEON_ORDER, buildQuestChain, stageMif,
} from '../../src/game/questData.js';
import {
  QUEST_EVENTS, applyQuestEvent, createQuestState, currentObjective, deserializeQuestState,
  questLog, serializeQuestState,
} from '../../src/game/questState.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = () => new ArenaData(nodeSource(ARENA), { onWarn: () => {} });
const world = await loadWorldMap(data());
const chain = buildQuestChain(world);
const loose = await discoverLooseMifs(nodeSource(ARENA));
const shipped = enterableDungeons(world, enterableFromListing(loose));

/** Run a list of events and give back the state, asserting each one was accepted. */
function play(state, events) {
  let current = state;
  for (const event of events) {
    const result = applyQuestEvent(current, event, { chain });
    assert.equal(result.ok, true, `"${event}" was refused: ${result.reason}`);
    current = result.state;
  }
  return current;
}

/** The whole quest, in the order the game is meant to be played. */
const FULL_QUEST = [
  'escaped',
  ...STAFF_DUNGEON_ORDER.flatMap(() => ['foundClue', 'foundPiece']),
  'staffAssembled', 'mithrilKey', 'jewelOfFire', 'won',
];

test('the chain is derived from CITYDATA.64: ten stages, in the documented order', () => {
  assert.equal(chain.stages.length, 10, 'the escape, eight pieces, the finale');
  assert.deepEqual(chain.missing, [], 'every named dungeon is in this data set');
  assert.deepEqual(chain.warnings, []);
  assert.equal(chain.stages[0].kind, 'escape');
  assert.equal(chain.stages[0].mif, START_DUNGEON.mif);
  assert.equal(chain.stages[9].kind, 'finale');
  assert.equal(chain.stages[9].title, FINAL_DUNGEON.name);
  assert.deepEqual(
    chain.stages.slice(1, 9).map((s) => s.title),
    [...STAFF_DUNGEON_ORDER],
  );
  assert.deepEqual(chain.stages.slice(1, 9).map((s) => s.piece), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('each piece is its province\'s staff dungeon, and the clue is the other one', () => {
  const provinces = new Set();
  for (const stage of chain.stages.slice(1, 9)) {
    provinces.add(stage.province);
    const [staff, map] = world.questDungeonsOf(stage.provinceID);
    assert.equal(staff.name, stage.title, `${stage.title} is ${stage.province}'s staff dungeon`);
    assert.equal(map.name, stage.clue.title, `${stage.clue.title} is ${stage.province}'s other quest dungeon`);
    assert.notEqual(staff.name, map.name);
    assert.equal(stage.province, world.provinces[stage.provinceID].name);
    assert.equal(stage.clue.provinceID ?? stage.provinceID, stage.provinceID);
  }
  assert.equal(provinces.size, 8, 'eight pieces, eight different provinces');
  assert.equal(provinces.has('Imperial Province'), false, 'the Imperial Province is the finale, not a piece');
});

test('every stage names a .MIF the player\'s own install has', () => {
  // A dungeon's filename is its seed (`docs/FORMATS.md` §8c) — Arena generates those
  // levels from the seed rather than shipping them, which is why they are numbers. The
  // escape and the palace are the two exceptions: real files beside the game.
  const expected = [
    'START.MIF',
    '42068779.MIF', '41418704.MIF', '40852494.MIF', '39300577.MIF',
    '42488253.MIF', '41649375.MIF', '40516921.MIF', '42026882.MIF',
    'IMPPAL.MIF',
  ];
  assert.deepEqual(chain.stages.map((stage) => stageMif(stage)), expected);
  // …and the map dungeons each piece needs first, which are the provinces' *other*
  // quest dungeon. Both halves together are the sixteen the install ships.
  assert.deepEqual(chain.stages.slice(1, 9).map((stage) => stage.clue.mif), [
    '39699021.MIF', '42110737.MIF', '40642738.MIF', '40370128.MIF',
    '41229981.MIF', '40181409.MIF', '42194658.MIF', '39950681.MIF',
  ]);
  for (const name of [...expected, ...chain.stages.slice(1, 9).map((s) => s.clue.mif)]) {
    assert.ok(loose.has(name.toUpperCase()), `${name} is in the Arena folder`);
  }
  assert.equal(expected.length, 10, 'the escape, eight pieces, the finale');
  // Every dungeon the install can open (all 144: sixteen ship their own map and 128 are
  // assembled from the pieces — `game/dungeonPlan.js`), and the quest's own sixteen are
  // among them. The *named* sixteen are the ones it must use, because a stage's title is a
  // name the install really has.
  const dungeonNames = new Set(shipped.map((d) => d.name));
  assert.equal(shipped.length, 144);
  const realNames = new Set(shipped.filter((d) => loose.has(String(d.mif).toUpperCase())).map((d) => d.name));
  assert.equal(realNames.size, 16);
  for (const stage of chain.stages.slice(1, 9)) {
    assert.ok(dungeonNames.has(stage.title), `${stage.title}'s map is in this install`);
    assert.ok(dungeonNames.has(stage.clue.title), `${stage.clue.title}'s map is in this install`);
    assert.ok(realNames.has(stage.title), `${stage.title} is one of the sixteen the install names`);
    assert.ok(realNames.has(stage.clue.title), `${stage.clue.title} is one of them too`);
  }
});

test('the palace really has four levels, each with its own INF', async () => {
  const mif = await data().mif(FINAL_DUNGEON.mif);
  assert.equal(mif.levelCount, 4);
  assert.deepEqual(mif.levels.map((l) => l.info.toUpperCase()), ['IMPPAL1.INF', 'IMPPAL2.INF', 'IMPPAL3.INF', 'IMPPAL4.INF']);
  // The finale's bottom level is where the Jewel and the key are placed, so the scene
  // needs the level count to be the one the walkthrough describes.
  assert.equal(mif.startingLevelIndex, 0);
});

test('every stage has a line of Ria Silmane\'s text of its own', () => {
  assert.equal(STAGE_TEXT.length, 10);
  assert.ok(new Set(STAGE_TEXT).size === 10);
  for (const stage of chain.stages) assert.ok(STAGE_TEXT.includes(stage.text), `${stage.title} quotes the chain`);
});

test('the map dungeon of a stage is never the piece dungeon of the same stage', () => {
  for (const stage of chain.stages.slice(1, 9)) {
    assert.notEqual(stageMif(stage), stageMif({ dungeonSeed: stage.clue.dungeonSeed }), `${stage.title} and ${stage.clue.title} are different maps`);
    assert.notEqual(stage.clue.mif, stage.mif);
  }
});

test('a fresh quest is at the escape, with nothing held and nothing known', () => {
  const fresh = createQuestState();
  assert.deepEqual(fresh, {
    step: 0, pieces: 0, mapKnown: false, mithrilKey: false, hasKeyItem: false,
    ended: false, log: [], visited: [],
  });
  assert.equal(currentObjective(fresh, chain), 'Escape Imperial Dungeons.');
});

test('the whole quest can be walked, and says so at every step', () => {
  let state = createQuestState();
  state = play(state, ['escaped']);
  assert.equal(state.step, 1);
  assert.equal(state.mapKnown, false);
  assert.match(currentObjective(state, chain), /Learn where piece 1 lies/);

  for (let piece = 1; piece <= 8; piece++) {
    const before = currentObjective(state, chain);
    assert.match(before, new RegExp(`Learn where piece ${piece} lies`), `piece ${piece} starts unknown`);
    state = play(state, ['foundClue']);
    assert.equal(state.mapKnown, true);
    assert.match(currentObjective(state, chain), new RegExp(`Recover piece ${piece} of the Staff from`));
    state = play(state, ['foundPiece']);
    assert.equal(state.pieces, piece);
    assert.equal(state.mapKnown, false, 'the next piece has its own map to find');
    assert.equal(state.step, piece + 1);
  }

  state = play(state, ['staffAssembled']);
  assert.equal(state.step, 9, 'the finale');
  assert.match(currentObjective(state, chain), /mithril key/);

  state = play(state, ['mithrilKey']);
  assert.equal(state.mithrilKey, true);
  assert.match(currentObjective(state, chain), /Jewel of Fire/);

  state = play(state, ['jewelOfFire']);
  assert.equal(state.hasKeyItem, true);
  assert.match(currentObjective(state, chain), /free the Emperor/);

  state = play(state, ['won']);
  assert.equal(state.ended, true);
  assert.equal(currentObjective(state, chain), 'The Arena is at peace.');
  assert.equal(state.log.length, 1 + 8 * 2 + 4, 'an entry for every event that was accepted');
  assert.match(state.log.at(-1), /Jagar Tharn is undone/);
  const log = questLog(state, chain);
  assert.equal(log.ended, true);
  assert.equal(log.hasJewel, true);
  assert.equal(log.hasMithrilKey, true);
  assert.equal(log.pieces, 8);
  assert.equal(log.stage, FINAL_DUNGEON.name);
});

test('a piece cannot be taken before its map, nor twice', () => {
  // At the escape stage there is no piece to take at all, and on the first piece's
  // stage the answer is that its dungeon is not known yet — two different refusals.
  let refused = applyQuestEvent(createQuestState(), 'foundPiece', { chain });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /no Staff piece is within reach here/);

  let state = play(createQuestState(), ['escaped']);
  refused = applyQuestEvent(state, 'foundPiece', { chain });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /do not know where this piece is yet/);

  state = play(state, ['foundClue', 'foundPiece']);
  refused = applyQuestEvent(state, 'foundPiece', { chain });
  assert.equal(refused.ok, false, 'the same piece cannot be taken again');
  assert.equal(refused.state.pieces, 1, 'and a refusal changes nothing');

  // A clue dungeon is not a piece dungeon: at the clue stage the event is `foundClue`.
  state = play(state, ['foundClue']);
  refused = applyQuestEvent(state, 'foundClue', { chain });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /already known/);
});

test('the finale refuses a key without the Staff, a Jewel without the key, and a win without the Jewel', () => {
  // The palace is reachable before the Staff is whole (it is a marker on the map), so
  // the machine — not the map — has to be the gate.
  const early = createQuestState();
  let refused = applyQuestEvent(early, 'mithrilKey', { chain });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /no such key outside the Imperial Palace|Staff is whole/);

  // On any piece stage the key does not exist, however many pieces are held.
  let mid = play(createQuestState(), ['escaped', 'foundClue', 'foundPiece']);
  refused = applyQuestEvent(mid, 'mithrilKey', { chain });
  assert.equal(refused.ok, false, 'there is no mithril key outside the palace');

  // The eighth piece moves the quest to the finale, and *that* is what unlocks both
  // of the palace's items — `staffAssembled` is Ria Silmane's line, not a gate.
  let state = play(createQuestState(), ['escaped', ...STAFF_DUNGEON_ORDER.flatMap(() => ['foundClue', 'foundPiece'])]);
  assert.equal(state.step, 9);
  assert.equal(state.pieces, 8);

  refused = applyQuestEvent(state, 'jewelOfFire', { chain });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /magically locked/);

  refused = applyQuestEvent(state, 'won', { chain });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /Jewel of Fire is needed/);

  state = play(state, ['mithrilKey']);
  refused = applyQuestEvent(state, 'mithrilKey', { chain });
  assert.equal(refused.ok, false, 'the key cannot be found twice');

  state = play(state, ['jewelOfFire', 'won']);
  refused = applyQuestEvent(state, 'won', { chain });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /already over/);
});

test('the escape happens once, and an unknown event is refused by name', () => {
  let state = play(createQuestState(), ['escaped']);
  const again = applyQuestEvent(state, 'escaped', { chain });
  assert.equal(again.ok, false);
  assert.match(again.reason, /already escaped/);

  const nonsense = applyQuestEvent(state, 'summonOblivion', { chain });
  assert.equal(nonsense.ok, false);
  assert.match(nonsense.reason, /unknown quest event/);
  for (const event of QUEST_EVENTS) {
    assert.equal(typeof event, 'string');
  }
});

test('the quest survives a save and a load, mithril key and all', () => {
  const finished = play(createQuestState(), FULL_QUEST);
  const restored = deserializeQuestState(JSON.parse(JSON.stringify(serializeQuestState(finished))));
  assert.deepEqual(restored, finished);
  assert.equal(restored.ended, true);
  assert.equal(restored.hasKeyItem, true);
  assert.equal(restored.mithrilKey, true);
  assert.equal(restored.log.length, finished.log.length);

  // And a half-done quest round-trips just as exactly — the flags are what the palace
  // reads to decide which of its three beats comes next.
  const partial = play(createQuestState(), ['escaped', 'foundClue', 'foundPiece', 'foundClue', 'foundPiece']);
  const back = deserializeQuestState(JSON.parse(JSON.stringify(serializeQuestState(partial))));
  assert.equal(back.pieces, 2);
  assert.equal(back.mithrilKey, false);
  assert.equal(back.hasKeyItem, false);
  assert.equal(back.ended, false);
  assert.equal(back.step, 3);
  assert.deepEqual(back, partial);

  // The state the palace is actually read in: the Staff is whole and the key is in
  // hand, so the next thing the bottom level offers is the Jewel's locked cell.
  const atThePalace = play(createQuestState(), [
    'escaped', ...STAFF_DUNGEON_ORDER.flatMap(() => ['foundClue', 'foundPiece']), 'staffAssembled', 'mithrilKey',
  ]);
  const palace = deserializeQuestState(JSON.parse(JSON.stringify(serializeQuestState(atThePalace))));
  assert.equal(palace.step, 9);
  assert.equal(palace.pieces, 8);
  assert.equal(palace.mithrilKey, true);
  assert.equal(palace.hasKeyItem, false);
  assert.match(currentObjective(palace, chain), /Carry the mithril key to the Jewel of Fire/);
});

test('a missing or damaged save is not a crash', () => {
  const fresh = createQuestState();
  for (const junk of [null, undefined, 7, 'quest', {}, { step: -3, pieces: 99, log: 'nope' }, { pieces: 2.5 }]) {
    const state = deserializeQuestState(junk);
    assert.equal(typeof state.step, 'number');
    assert.equal(Number.isInteger(state.step), true);
    assert.equal(state.step >= 0, true);
    assert.equal(state.pieces >= 0 && state.pieces <= 8, true, `pieces out of range for ${JSON.stringify(junk)}`);
    assert.equal(Array.isArray(state.log), true);
    assert.equal(typeof state.mithrilKey, 'boolean');
    assert.equal(typeof state.ended, 'boolean');
    assert.deepEqual(currentObjective(state, chain) === null, false);
  }
  const capped = deserializeQuestState({ step: 99, pieces: 8, log: [] });
  assert.equal(capped.step, 99, 'a step beyond the chain is left alone: `currentObjective` handles it');
  assert.equal(currentObjective(capped, chain), 'The quest is complete.');
  assert.equal(fresh.step, 0);
});
