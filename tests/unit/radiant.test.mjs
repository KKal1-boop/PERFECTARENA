// RADIANT QUESTS: GENERATED FROM ARENA'S OWN WORLD, AND CHECKABLE.
//
// A generated quest is easy to *look* right and hard to be sure of, so these tests
// ask the questions that can be answered wrong:
//
//   * do the tables the quests are built from exist in Arena's data? `ARTIFACTS`
//     must appear in the artifact banks' own prose, and `MONSTERS` must be read off
//     the archive's sprite-set filenames (`GOBLIN*.CFA`). Both are checked against
//     the real files, in the same spirit as the city-block tables.
//   * does every generated quest point at a place that *exists*? A dungeon job must
//     name one of the 16 dungeons whose `.MIF` this install actually ships, and a
//     delivery must name a settlement `CITYDATA.64` has.
//   * is the draw deterministic, so a save file is a seed and a test can name an
//     offer?
//   * does the state machine refuse the transitions it should — doing the work from
//     the wrong place, collecting a reward from the wrong town, finishing a job out
//     of order, and letting a deadline pass?
//
// Run:  node --test tests/unit/radiant.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { parseBsa } from '../../src/arena/bsaArchive.js';
import { DUNGEON_BLOCKS_MIF } from '../../src/game/dungeonPlan.js';
import { decodeText, loadArenaText } from '../../src/arena/arenaText.js';
import { loadWorldMap } from '../../src/game/worldMap.js';
import {
  ARTIFACTS, ITEMS, MONSTERS, OFFERS_PER_BOARD, RADIANT_EVENTS, RADIANT_KINDS,
  advanceDays, applyRadiantEvent, buildBoard, createRadiantState, deserializeRadiantState,
  discoverLooseMifs, enterableDungeons, enterableFromListing, generateQuest, offerReadsWhole,
  personOffer, radiantLog, radiantObjective, serializeRadiantState, slayProgress,
} from '../../src/game/radiantQuests.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const folder = () => nodeSource(ARENA);
const data = () => new ArenaData(folder(), { onWarn: () => {} });

/** The world, the text and the enterable dungeons, loaded once for the whole file. */
const world = await loadWorldMap(data());
const library = await loadArenaText(data());
const loose = await discoverLooseMifs(folder());
const dungeons = enterableDungeons(world, enterableFromListing(loose));

test('the dungeons a radiant quest may use are the ones the install can open', async () => {
  // **All 144, in two ways.** Sixteen ship their own map (two per province, the quest
  // dungeons); the other 128 are the records the original generated, and `game/dungeonPlan.js`
  // assembles them from the install's own pieces (`RANDOM1.MIF`), which is why a job may now
  // aim at any dungeon on the map instead of the same sixteen.
  const all = world.locations.filter((l) => l.kind === 'dungeon');
  assert.equal(all.length, 144, 'nine provinces, sixteen dungeon records each');
  assert.equal(dungeons.length, 144, 'every dungeon record is a place the game can open');
  const shipped = all.filter((l) => loose.has(String(l.mif).toUpperCase()));
  assert.equal(shipped.length, 16, 'sixteen of them ship their own map');
  assert.equal(loose.has(DUNGEON_BLOCKS_MIF), true, 'and the pieces for the rest are in the folder');
  const enterable = enterableFromListing(loose);
  for (const dungeon of dungeons) {
    assert.ok(enterable(dungeon), `${dungeon.name} (${dungeon.mif}) can be opened`);
    // A quest has to *name* where it sends the player: the sixteen carry the install's own
    // names, the rest are named by `game/dungeonNames.js` from their own seed.
    assert.ok(typeof dungeon.name === 'string' && dungeon.name.length > 2, `${dungeon.mif} has a name`);
  }
  assert.equal(new Set(dungeons.map((d) => d.name)).size, 144, 'and no two dungeons share one');
});

test('every artifact a quest can name is named in Arena\'s own artifact banks', async () => {
  const banks = [
    decodeText(await data().must('artfact1.dat')),
    decodeText(await data().must('artfact2.dat')),
  ].join('\n');
  assert.ok(ARTIFACTS.length >= 10, `${ARTIFACTS.length} artifacts`);
  for (const artifact of ARTIFACTS) {
    assert.ok(banks.includes(artifact.name), `"${artifact.name}" appears in the artifact banks`);
  }
});

test('every creature a quest can name is a sprite set the archive really holds', async () => {
  const bsa = parseBsa(new Uint8Array(await readFile(join(ARENA, 'GLOBAL.BSA'))), 'GLOBAL.BSA');
  const cfas = bsa.names().filter((n) => n.endsWith('.CFA'));
  assert.equal(cfas.length, 340, 'the archive holds 340 character-frame sets');
  assert.ok(MONSTERS.length >= 15, `${MONSTERS.length} creatures`);
  for (const monster of MONSTERS) {
    assert.ok(cfas.some((n) => n.startsWith(monster.cfa)),
      `${monster.name} is in the archive as ${monster.cfa}*.CFA`);
  }
});

test('the trinkets and the reward tiers are coherent', () => {
  assert.ok(ITEMS.length >= 8, `${ITEMS.length} trinkets`);
  for (const item of ITEMS) assert.ok(/^a |^an /.test(item.name), `"${item.name}" reads as an object`);
  for (const table of [ARTIFACTS, MONSTERS, ITEMS]) {
    for (const entry of table) {
      assert.ok(Number.isInteger(entry.tier) && entry.tier >= 1 && entry.tier <= 4, `${entry.name} has a tier`);
    }
  }
  assert.equal(RADIANT_KINDS.length, 5);
  assert.equal(OFFERS_PER_BOARD, 3);
});

test('an artifact speech is paid the price the speech itself names', () => {
  // The panel and the purse have to agree, and Arena's recruiting speeches quote their own
  // price to the player — `%oap` the asking price, `%nap` half of it — filled by
  // `artifactValues`. In this install 48 of the 372 offers name the full price, 142 name
  // half, and none names both, so the rule is exact: whatever word the speech uses is the
  // number the player is agreeing to, and a `slay` or `fetch` job keeps the world's own
  // distance-and-danger figure.
  const counts = { full: 0, half: 0, none: 0 };
  for (const giver of [world.byName('Daggerfall'), world.byName('Sentinel'), world.byName('Ebonheart')]) {
    for (let seed = 1; seed <= 120; seed++) {
      const quest = generateQuest({ world, library, kind: 'artifact', seed, giver, day: 1, dungeons });
      assert.equal(quest.reward % 5, 0, `${quest.reward} is a purse, not a sum`);
      if (!quest.dataText) { counts.none++; assert.ok(quest.reward > 0); continue; }
      const asking = 100 + quest.tier * 150;
      if (quest.priceWord === 'oap') {
        counts.full++;
        assert.equal(quest.reward, asking, `${quest.subject}: the speech asks ${asking}`);
      } else if (quest.priceWord === 'nap') {
        counts.half++;
        assert.equal(quest.reward, Math.round(asking / 2), `${quest.subject}: the speech asks half of ${asking}`);
      } else {
        // A speech that names no price keeps the world's own distance-and-danger figure, and
        // there is no number in its words for the purse to disagree with.
        assert.equal(quest.priceWord, null, `a speech is priced by `+'`oap`'+`, `+'`nap`'+` or nothing`);
        counts.none++;
      }
      // …and when it *does* name one, the number on the panel is the number in the purse.
      if (quest.priceWord) {
        assert.match(quest.text, new RegExp(`(^|[^0-9])${quest.reward}([^0-9]|$)`),
          `${quest.subject}: "${quest.text.replace(/\s+/g, ' ').slice(-120)}" names ${quest.reward}`);
      }
    }
  }
  assert.ok(counts.full > 0 && counts.half > 0, `full ${counts.full}, half ${counts.half}, none ${counts.none}`);
});

test('an offer reads as a whole sentence once it is filled, in every kind', () => {
  // The suite of checks the `%amn` defect came out of: a template word with nothing to fill
  // it is *dropped* by `fillTemplate`, so the sentence arrives whole-looking and broken —
  // "The place is called the," — which is worse than an unfilled `%`, because nothing says
  // a word is missing. Every offer, for every kind, in every province, must come out with no
  // `%` left and no filler left dangling.
  const DANGLING = [
    /\bthe\s*,/, /\ba\s*,/, /\ban\s*,/, /\bof\s*,/, /\bto\s*,/, /\bin\s*,/,
    /\s,/, /\s{2,}\s*,/, /\bthe\s+the\b/i, /\band\s+and\b/i,
  ];
  let checked = 0;
  for (const giver of [world.byName('Daggerfall'), world.byName('Sentinel'), world.byName('Wayrest')]) {
    for (let seed = 1; seed <= 60; seed++) {
      for (const kind of RADIANT_KINDS) {
        const quest = generateQuest({ world, library, kind: kind.id, seed, giver, day: 1, dungeons });
        checked++;
        const text = quest.text.replace(/\s+/g, ' ');
        // The generator's own rule, so the two cannot drift: what it will offer, and what it
        // will only offer if it reads.
        assert.ok(offerReadsWhole(text), `${kind.id} seed ${seed}: "${text.slice(0, 200)}" reads whole`);
        for (const pattern of DANGLING) {
          assert.ok(!pattern.test(text), `${kind.id} seed ${seed}: "${text.match(pattern)?.[0]}" left dangling in "${text.slice(0, 200)}"`);
        }
        assert.ok(!/\s\./.test(text), `${kind.id} seed ${seed}: a space before a full stop`);
        assert.ok(text.length > 60, `${kind.id} seed ${seed}: the offer says something real`);
      }
    }
  }
  assert.ok(checked >= 900, `${checked} offers read`);
});

test('an offer that would read broken is not offered at all', () => {
  // The pool is 372 offers and every artifact has several, so refusing the ones whose words
  // this project cannot fill costs a player nothing — and the alternative is a headline that
  // says "I'll tell you where to go," with the noun dropped out of it.
  const broken = [
    `Only so many words, %tn, but I can tell you.`,       // a form of address, dropped
    `I will tell you where to go to %pcf, and give you the map,`,  // a noun dropped before a comma
    `Come back in the next %dit days, and see me at the %ct,`,    // two words dropped
  ];
  for (const text of broken) assert.equal(offerReadsWhole(text), false, `"${text}" is refused`);
  const whole = [
    `A man in the corner says he knows where Chrysamere lies, and he will part with that for 550 gold.`,
    `The road leads to Murk Keep, in High Rock, and the rest is yours.`,
  ];
  for (const text of whole) assert.equal(offerReadsWhole(text), true, `"${text}" reads`);
});

test('a speech talks about the place the job really sends the player', () => {
  // `%amn` is the place a speech sells and `%lp`/`%cn` are the land the one selling it stands
  // in; all three are names this project has, and a job whose prose names somewhere else is
  // the panel lying about where the player is going.
  let withAmn = 0;
  for (const giver of [world.byName('Daggerfall'), world.byName('Sentinel')]) {
    for (let seed = 1; seed <= 200; seed++) {
      const quest = generateQuest({ world, library, kind: 'artifact', seed, giver, day: 1, dungeons });
      if (!/called the /.test(quest.text)) continue;
      withAmn++;
      assert.ok(quest.text.includes(quest.target),
        `seed ${seed}: "${quest.text.replace(/\s+/g, ' ').slice(-120)}" names ${quest.target}`);
    }
  }
  assert.ok(withAmn > 0, `${withAmn} offers name the place they are selling`);
});

test('a generated quest always points somewhere the game can actually go', () => {
  // `CITYDATA.64` is a fixed 32 settlement slots per province and ships 31 of the Imperial
  // Province's as **empty records** with no name and no coordinates — which used to be in
  // `world.settlements()`, so a delivery drawn at random from that list named nowhere:
  // "Carry word to", `Travel to  — ...`. The world **places** those 31 now (the later games'
  // Cyrodiil, `game/cyrodiil.js`, D-39 — `world.placed` is the count), so the list a
  // delivery draws from has no anonymous entry left; the empty name is still not a place a
  // quest may name, and this check is the same defect seen from the other side.
  const names = new Set(world.locations.filter((l) => l.name).map((l) => l.name.toLowerCase()));
  const anonymous = world.settlements().filter((l) => !l.name);
  assert.equal(world.placed, 31, 'the file\u2019s 31 nameless settlement slots');
  assert.equal(anonymous.length, 0, 'and the world places every one of them');
  assert.ok(!names.has(''), 'the empty name is not a place a quest may name');
  for (const giver of [world.byName('Daggerfall'), world.byName('Sentinel'), world.byName('Ebonheart')]) {
    for (let seed = 1; seed <= 40; seed++) {
      for (const kind of RADIANT_KINDS) {
        const quest = generateQuest({ world, library, kind: kind.id, seed, giver, day: seed, dungeons });
        assert.ok(quest.target.length > 2, `${kind.id}: "${quest.target}" names somewhere`);
        assert.ok(names.has(quest.target.toLowerCase()), `${kind.id}: ${quest.target} is a real location`);
        assert.ok(quest.targetProvince, `${kind.id}: the target is in a province`);
        if (kind.needsDungeon) {
          assert.ok(dungeons.some((d) => d.name.toLowerCase() === quest.target.toLowerCase()),
            `${kind.id}: ${quest.target} is enterable`);
          // The target's own map, or the install's pieces that assemble one for it.
          const target = world.byName(quest.target);
          assert.ok(target && enterableFromListing(loose)(target),
            `${kind.id}: ${quest.target} (${quest.targetMif}) can be opened`);
        }
        assert.ok(quest.days >= 4, `${kind.id}: ${quest.days} days is enough to make the trip`);
        assert.ok(quest.reward > 0 && quest.reward % 5 === 0, `${kind.id}: ${quest.reward} gold`);
        assert.ok(quest.text.length > 40, `${kind.id}: the offer says something`);
        assert.equal(quest.giver, giver.name);
        assert.ok(quest.subject, `${kind.id}: the job names its subject`);
      }
    }
  }
});

test('no offer is ever aimed at a settlement the player cannot name', () => {
  // Every settlement the game has, as a giver, over every kind and a spread of seeds:
  // this is the sweep that would have caught the empty-target delivery, and it is the
  // rule the world map's board and a townsperson's offer both rest on.
  const settlements = world.settlements();
  const checked = new Set();
  for (let i = 0; i < settlements.length; i++) {
    const giver = settlements[i];
    for (let seed = 1; seed <= 6; seed++) {
      for (const spec of RADIANT_KINDS) {
        const kind = spec.needsDungeon && !dungeons.length ? 'deliver' : spec.id;
        const quest = generateQuest({ world, library, kind, seed, giver, day: seed, dungeons });
        checked.add(quest.kind);
        assert.ok(quest.target && quest.target.length > 2,
          `${giver.name} seed ${seed} ${kind}: named "${quest.target}"`);
        assert.ok(quest.text.length > 40 && !/%/.test(quest.text),
          `${giver.name}: the prose is whole — ${quest.text.slice(0, 60)}`);
        assert.ok(quest.targetProvince, `${quest.target} is in a province`);
      }
    }
  }
  assert.deepEqual([...checked].sort(), RADIANT_KINDS.map((k) => k.id).sort());
});

test('the offer board is the settlement it is posted in, and delivery names a real town', () => {
  const giver = world.byName('Daggerfall');
  const board = buildBoard({ world, library, seed: 4242, giver, day: 3, dungeons });
  assert.ok(board.length >= 2, `${board.length} postings`);
  const towns = new Set(world.settlements().filter((s) => s.name).map((s) => s.name));
  for (const offer of board) {
    if (offer.kind === 'deliver') assert.ok(towns.has(offer.target), `${offer.target} is a town`);
    assert.equal(offer.giver, 'Daggerfall');
    assert.ok(offer.reward > 0 && offer.days >= 4);
  }
  // And a person inside a building is given the town's own board to hand out, not a
  // reroll of their own: the tavern keeper's offer is the keeper's, every time.
  const person = { place: { row: 12, col: 11 } };
  const first = personOffer({ world, library, giver, person, day: 3, dungeons });
  const again = personOffer({ world, library, giver, person, day: 3, dungeons });
  assert.equal(first.id, again.id);
  assert.ok(first.target.length > 2, `"${first.target}"`);
});

test('an artifact quest names the artifact its own prose is selling', () => {
  // The speech is Arena's, and it names the artifact it offers — so the title and
  // the text must agree rather than being drawn separately.
  const giver = world.byName('Daggerfall');
  let fromData = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const quest = generateQuest({ world, library, kind: 'artifact', seed, giver, day: 1, dungeons });
    const subject = quest.subject;
    assert.ok(ARTIFACTS.some((a) => a.name === subject), `${subject} is one of the table`);
    assert.match(quest.title, new RegExp(subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    if (quest.dataText) {
      fromData++;
      assert.match(quest.text, new RegExp(subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        'Arena\'s speech mentions the artifact the quest is for');
      assert.match(quest.source, /^Arena: artfact[12]\.dat$/, 'the speech is credited to its bank');
    }
  }
  assert.equal(fromData, 30, 'a bank with 372 offers always has one to hand');
});

test('the draw is deterministic: the same seed is the same job', () => {
  const giver = world.byName('Wayrest');
  const once = buildBoard({ world, library, seed: 12345, giver, day: 7, dungeons });
  const twice = buildBoard({ world, library, seed: 12345, giver, day: 7, dungeons });
  assert.deepEqual(once, twice, 'the same town on the same day posts the same board');
  const other = buildBoard({ world, library, seed: 99, giver, day: 7, dungeons });
  assert.notDeepEqual(once.map((o) => o.title), other.map((o) => o.title), 'and a different seed does not');
  // A town's board does not repeat a kind while it has one to spare.
  const kinds = once.map((o) => o.kind);
  assert.equal(new Set(kinds).size, kinds.length, `no repeated kind on one board: ${kinds.join(', ')}`);
});

test('the state machine refuses work done in the wrong place, or out of order', () => {
  const giver = world.byName('Daggerfall');
  const board = buildBoard({ world, library, seed: 4242, giver, day: 1, dungeons });
  const offer = board.find((o) => o.kind !== 'deliver') ?? board[0];
  const finish = { artifact: 'found', fetch: 'found', slay: 'killed', rescue: 'rescue', deliver: 'deliver' }[offer.kind];

  let state = createRadiantState();
  const logged = radiantLog(state);
  assert.equal(logged.offers.length, 0, 'a fresh state has no offers until a board is read');

  // Nothing can be finished before it is taken.
  assert.equal(applyRadiantEvent(state, finish, { where: offer.target }).ok, false);
  assert.equal(applyRadiantEvent(state, 'return', { where: giver.name }).ok, false);

  const accepted = applyRadiantEvent(state, 'accept', { offer });
  assert.equal(accepted.ok, true);
  state = accepted.state;
  assert.equal(state.active.id, offer.id);
  assert.match(radiantObjective(state), /Travel to|Deliver to/);

  // A second job cannot be taken while one is in hand.
  const second = board.find((o) => o.id !== offer.id);
  assert.equal(applyRadiantEvent(state, 'accept', { offer: second }).ok, false);

  // The work itself only happens at the target…
  const elsewhere = applyRadiantEvent(state, finish, { where: 'Somewhere Else' });
  assert.equal(elsewhere.ok, false);
  assert.match(elsewhere.reason, new RegExp(offer.target));
  // …and the reward only at the giver.
  assert.equal(applyRadiantEvent(state, 'return', { where: offer.target }).ok, false);
  if (offer.kind === 'slay') {
    const progress = slayProgress(state.active);
    for (const encounterId of progress.ids) {
      const result = applyRadiantEvent(state, 'killed', { where: offer.target, questId: offer.id, monster: progress.monster, encounterId });
      assert.equal(result.ok, true, result.reason); state = result.state;
    }
  } else {
    assert.equal(applyRadiantEvent(state, finish, { where: offer.target }).ok, true);
    state = applyRadiantEvent(state, finish, { where: offer.target }).state;
  }
  assert.match(radiantObjective(state), /Return to/);
  const paid = applyRadiantEvent(state, 'return', { where: offer.giver });
  assert.equal(paid.ok, true);
  state = paid.state;
  assert.equal(paid.gold, offer.reward);
  assert.equal(state.gold, offer.reward);
  assert.equal(state.taken, 1);
  assert.equal(state.active, null);
  assert.match(state.log.at(-1), /Completed/);

  // Every event the machine documents is either performed or refused — never a
  // silent no-op, which is what would let a save file drift out of its own rules.
  for (const event of RADIANT_EVENTS) {
    const result = applyRadiantEvent(state, event, { offer, where: offer.target });
    assert.equal(typeof result.ok, 'boolean');
    if (!result.ok) assert.ok(result.reason, `${event} was refused for a stated reason`);
  }
  assert.equal(applyRadiantEvent(state, 'nonsense', {}).ok, false);
});

test('a deadline is measured in the world\'s own days', () => {
  const giver = world.byName('Daggerfall');
  const offer = buildBoard({ world, library, seed: 777, giver, day: 1, dungeons })[0];
  let state = applyRadiantEvent(createRadiantState(), 'accept', { offer }).state;
  state = advanceDays(state, offer.days - 1);
  assert.equal(state.active?.id, offer.id, 'still in hand on the second-to-last day');
  assert.ok(radiantLog(state).active.daysLeft >= 1, `${radiantLog(state).active.daysLeft} days left`);
  state = advanceDays(state, 2);
  assert.equal(state.active, null, 'past the deadline the job is gone');
  assert.equal(state.failed, 1);
  assert.match(state.log.at(-1), /the \d+ days ran out/);
});

test('the side work round-trips through JSON, like the main quest does', () => {
  const giver = world.byName('Daggerfall');
  const board = buildBoard({ world, library, seed: 5, giver, day: 3, dungeons });
  let state = createRadiantState();
  state = { ...state, offers: board, day: 9 };
  state = applyRadiantEvent(state, 'accept', { offer: board[0] }).state;
  const restored = deserializeRadiantState(JSON.parse(JSON.stringify(serializeRadiantState(state))));
  assert.deepEqual(restored, state);
  // A partial or missing save is tolerated rather than fatal.
  assert.deepEqual(deserializeRadiantState(null), createRadiantState());
  assert.deepEqual(deserializeRadiantState({ gold: 'lots' }).gold, 0);
  assert.equal(deserializeRadiantState({ active: { title: 'x' } }).active.title, 'x');
});

test('a person in a town has work of their own, and the same work every time', () => {
  const giver = world.byName('Daggerfall');
  const person = { place: { row: 31, col: 17 } };
  const first = personOffer({ world, library, giver, person, day: 3, dungeons });
  assert.ok(first, 'a person in a city-state has something to offer');
  const again = personOffer({ world, library, giver, person, day: 3, dungeons });
  assert.deepEqual(again, first, 'the same person offers the same job, byte for byte');
  // …and the offer is a real job: a place the install can open, a purse and a deadline.
  const kinds = new Set(RADIANT_KINDS.map((k) => k.id));
  assert.ok(kinds.has(first.kind), first.kind);
  assert.ok(first.target && first.target.length > 2, first.target);
  assert.ok(first.reward > 0 && first.days >= 4, `${first.reward} gold in ${first.days} days`);
  assert.ok(!first.text.includes('%'), 'the offer has no unfilled word in it');
  const target = world.byName(first.target);
  if (first.targetMif) assert.ok(target && enterableFromListing(loose)(target), `${first.targetMif} can be opened`);
  else assert.ok(world.settlements().some((s) => s.name === first.target), `${first.target} is a real settlement`);
  // Two people in the same town are not the same person with the same problem: with five
  // kinds and 613 talk ids the draws differ by cell, and a row of neighbours should show it.
  const offers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => personOffer({
    world, library, giver, person: { place: { row: 20 + i, col: 40 + i * 3 } }, day: 3, dungeons,
  }));
  assert.equal(offers.filter(Boolean).length, 10);
  assert.ok(new Set(offers.map((o) => o.id)).size > 1, 'ten neighbours are not ten identical errands');
});

test('a person offers only what the install can honour, and nothing in a dungeon', () => {
  const giver = world.byName('Daggerfall');
  const person = { place: { row: 8, col: 8 } };
  // No dungeons in the install: only the kinds that need none may be offered, and they are.
  for (let i = 0; i < 40; i++) {
    const offer = personOffer({ world, library, giver, person: { place: { row: 5 + i, col: 9 } }, day: 1, dungeons: [] });
    if (!offer) continue;
    assert.equal(offer.kind, 'deliver', `${offer.kind} needs no dungeon here`);
    assert.equal(offer.targetMif, null);
  }
  // Nowhere to stand and nowhere to send: the picker answers null rather than guessing.
  assert.equal(personOffer({ world, library, giver, person: null, day: 1, dungeons }), null);
  assert.equal(personOffer({ world, library, giver, person: {}, day: 1, dungeons }), null);
  assert.equal(personOffer({ world, library, person, day: 1, dungeons }), null, 'no giver, no job');
  assert.ok(personOffer({ world, library, giver, person, day: 1, dungeons }));
});

test('taking a person\'s offer runs through the board\'s own state machine', () => {
  const giver = world.byName('Daggerfall');
  const offer = personOffer({ world, library, giver, person: { place: { row: 12, col: 4 } }, day: 2, dungeons });
  let state = createRadiantState();
  const taken = applyRadiantEvent(state, 'accept', { offer });
  assert.equal(taken.ok, true, taken.reason);
  state = taken.state;
  assert.equal(state.active.id, offer.id);
  assert.match(radiantLog(state).entries.at(-1), /Accepted/);
  // One job at a time, whoever offers the next one.
  const second = personOffer({ world, library, giver, person: { place: { row: 13, col: 5 } }, day: 2, dungeons });
  const refused = applyRadiantEvent(state, 'accept', { offer: second });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /still unfinished/);
});

test('an install with no dungeons cannot be offered a dungeon job', () => {
  const giver = world.byName('Daggerfall');
  assert.throws(() => generateQuest({ world, library, kind: 'slay', seed: 1, giver, day: 1, dungeons: [] }),
    /needs an enterable dungeon/);
  // The board falls back to the kinds that do not need one, rather than failing.
  const board = buildBoard({ world, library, seed: 1, giver, day: 1, dungeons: [], count: 3 });
  assert.equal(board.length, 1, 'only the delivery survives');
  assert.equal(board[0].kind, 'deliver');
});
