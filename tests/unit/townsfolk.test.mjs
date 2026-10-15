// TOWNSFOLK: THE ROSTER, THE PLACEMENT, AND EVERY WORD THEY SAY.
//
// Two things about a talk system are easy to get wrong in ways a player only notices much
// later: a person standing inside a wall, and a sentence with a `%`-word still in it. Both
// are checkable against the real files, so both are checked here.
//
//   * the roster is the archive's own people files — 65 walk files, ten sets, seven armour
//     writings, and the fact that no `11`–`15` set has a plate figure at all;
//   * every line a person can say comes out of `template.dat` and has no unfilled word in
//     it, whether it needed a province substituted or not;
//   * a person's *description* is read off the file name and nothing else, because the
//     name generator's tables are not in this data set;
//   * placement is deterministic and never in a wall, a chasm or a decoration.
//
// Run:  node --test tests/unit/townsfolk.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { loadArenaText, placeholdersOf } from '../../src/arena/arenaText.js';
import { loadWorldMap } from '../../src/game/worldMap.js';
import {
  ARMOUR_WORDS, describePerson, fillTalkLine, folkCountFor, folkFromListing, greetingFor,
  outfitsFromFolk, placeTownsfolk, talkCorpus, talkParts, topicsFor, viewFacing, viewFileFor,
} from '../../src/game/townsfolk.js';

/** A line a person could say: a whole sentence, not half of one. */
const talkIsWholeSentence = (text) => /^["'(A-Z0-9]/.test(text) && /[.!?”"]$/.test(text);

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = () => new ArenaData(nodeSource(ARENA), { onWarn: () => {} });

const archive = await data().bsa();
const names = archive.names();
const folk = folkFromListing(names);
const library = await loadArenaText(data());
const corpus = talkCorpus(library.talkTemplates);
const world = await loadWorldMap(data());

test('the roster is the archive\'s own people files, not a table of our own', () => {
  assert.equal(folk.length, 65, 'sixty-five walk files in this install');
  assert.equal(new Set(folk.map((f) => f.file)).size, 65, 'each one named once');
  for (const person of folk) {
    assert.match(person.file, /^\d\d(UNA|LTR|CHN|PLT|BAR|MAG|MNK)WLK\.CFA$/);
    assert.ok(names.includes(person.file), `${person.file} is in GLOBAL.BSA`);
  }
  // The shape of the data, stated as a test so a different install shows up as this
  // failing rather than as a quietly thinner town.
  const sets = [...new Set(folk.map((f) => f.set))].sort();
  assert.deepEqual(sets, ['01', '02', '03', '04', '05', '11', '12', '13', '14', '15']);
  const plateSets = folk.filter((f) => f.armour === 'PLT').map((f) => f.set).sort();
  assert.deepEqual(plateSets, ['01', '02', '03', '04', '05'], 'no 11–15 set has a plate figure');
  assert.equal(Object.keys(ARMOUR_WORDS).length, 7);
  for (const armour of Object.keys(ARMOUR_WORDS)) {
    assert.ok(folk.some((f) => f.armour === armour), `the archive has a ${armour} figure`);
  }
});

test('a person is described by what their own file name says they wear', () => {
  assert.equal(describePerson('01CHNWLK.CFA'), 'a person in chain mail');
  assert.equal(describePerson('01PLTWLK.CFA'), 'a person in plate armour');
  assert.equal(describePerson('11MAGWLK.CFA'), 'a person in robes');
  assert.equal(describePerson('05MNKWLK.CFA'), 'a person in a habit');
  assert.equal(describePerson('not-a-person.txt'), 'a stranger', 'and never crashes on junk');
  for (const person of folk) {
    const description = describePerson(person.file);
    assert.match(description, /^a person in /);
    assert.ok(description.includes(ARMOUR_WORDS[person.armour]), `${person.file} → ${description}`);
  }
});

test('the talk corpus is template.dat\'s own sentences, split by what can be filled', () => {
  // 811 recorded lines over 613 ids (`docs/PROGRESS.md`), which are 2 462 `&`-separated
  // parts; 1 823 of them are whole sentences, and the rest are continuations.
  assert.equal(corpus.total, 811);
  assert.equal(corpus.parts, 2462, 'the file\'s own parts, split on &');
  assert.equal(corpus.dropped, 639, 'parts that begin or end mid-sentence');
  assert.equal(corpus.plain.length + corpus.province.length + corpus.unfillable, corpus.parts - corpus.dropped);
  assert.equal(corpus.plain.length, 561, 'whole sentences with no %-word at all');
  assert.equal(corpus.province.length, 14, 'whole sentences that need only the country\'s name');

  for (const line of corpus.plain) {
    assert.equal(placeholdersOf(line.text).length, 0, `#${line.id} has no %-words`);
    assert.equal(talkIsWholeSentence(line.text), true, `#${line.id} is a whole sentence: ${line.text.slice(0, 70)}`);
  }
  for (const line of corpus.province) {
    const words = placeholdersOf(line.text);
    assert.ok(words.length > 0 && words.every((w) => w === 'cn' || w === 'cn2'), `#${line.id} wants ${words.join(',')}`);
    assert.equal(talkIsWholeSentence(line.text), true, `#${line.id} is a whole sentence`);
  }
  // No fragment may reach a player: the first version of this handed out
  // "have been constructing some interior woodwork at the palace", which is half a line.
  for (const corpusName of ['plain', 'province']) {
    for (const line of corpus[corpusName]) {
      assert.ok(line.text.length >= 30, `#${line.id} is long enough to be a sentence`);
      assert.match(line.text, /^["'(A-Z0-9]/);
      assert.match(line.text, /[.!?”"]$/);
      assert.ok(!line.text.includes('&'), `#${line.id} carries no part separator`);
    }
  }
});

test('every line a person can say is complete, with no %-word left in it', () => {
  // Every settlement in Tamriel, each with the neighbour the game's own map gives it:
  // no line may reach a player in any of the 288 of them, at any seed.
  const settlements = world.settlements();
  assert.equal(settlements.length, 288);
  for (const settlement of settlements.slice(0, 40)) {
    const neighbour = settlements
      .filter((s) => s.name !== settlement.name)
      .sort((a, b) => (
        Math.hypot(a.global.x - settlement.global.x, a.global.y - settlement.global.y)
        - Math.hypot(b.global.x - settlement.global.x, b.global.y - settlement.global.y)
      ))[0];
    const where = { place: settlement.name, neighbour: neighbour.name, province: settlement.province };
    for (let seed = 0; seed < 12; seed++) {
      const greeting = greetingFor(corpus, seed, 0);
      assert.ok(greeting, 'there is always a greeting');
      assert.equal(placeholdersOf(greeting.text).length, 0, `greeting #${greeting.id} is whole`);
      assert.ok(!greeting.text.includes('%'), `greeting #${greeting.id} shows no %`);
      for (const topic of topicsFor(corpus, where, seed)) {
        assert.ok(topic.text.length > 10, `${topic.key} is a sentence`);
        assert.ok(!topic.text.includes('%'), `${topic.key} ("${topic.text.slice(0, 60)}") has no %-word left`);
        assert.equal(placeholdersOf(topic.text).length, 0);
      }
    }
  }
  // A city-state line really does name the city-state it was asked about…
  const told = corpus.province[0];
  const filled = fillTalkLine(told.text, { place: 'Daggerfall', neighbour: 'Sentinel' });
  assert.equal(filled.unfilled.length, 0);
  assert.ok(filled.text.includes('Daggerfall'), filled.text.slice(0, 120));
  // …and a line that wants a word nobody has is refused rather than shown with a hole.
  const impossible = fillTalkLine('The %t of %cn sends his regards to %rf.', { place: 'Daggerfall' });
  assert.ok(impossible.unfilled.includes('t') || impossible.unfilled.includes('rf'),
    `an unfillable line is refused: ${JSON.stringify(impossible)}`);
  // And with no place to name at all there is nothing to substitute, so the question
  // is not offered — a dungeon has no city-state to ask about.
  const nowhere = topicsFor(corpus, { place: undefined }, 1);
  assert.equal(nowhere.some((t) => t.key === 'city'), false, 'no place, no city question');
  assert.equal(nowhere.length, 1, 'but there is still a line of local talk');
});

test('a person\'s answer changes when you keep asking, and walks the whole corpus', () => {
  const first = greetingFor(corpus, 11, 0);
  const second = greetingFor(corpus, 11, 1);
  assert.notEqual(first.text, second.text, 'a stranger who repeats one sentence feels dead');
  assert.equal(greetingFor(corpus, 11, 0).text, first.text, 'and the walk is deterministic');
  // A person walks the corpus one line at a time: every slot is visited before any of
  // them comes round again. The corpus holds 561 slots but only 530 *distinct* sentences
  // — the same line is recorded under more than one id, which is Arena's own redundancy
  // and is kept, because the id is what the panel credits.
  const distinct = new Set(corpus.plain.map((l) => l.text));
  assert.equal(distinct.size, 530, 'thirty-one sentences are recorded more than once');
  const seen = new Set();
  for (let turn = 0; turn < corpus.plain.length; turn++) seen.add(greetingFor(corpus, 3, turn).text);
  assert.equal(seen.size, distinct.size, `${seen.size} distinct over ${corpus.plain.length} turns`);
  assert.equal(greetingFor(corpus, 3, corpus.plain.length).text, greetingFor(corpus, 3, 0).text, 'and then it starts again');
  // Two people standing a cell apart do not say the same thing first.
  assert.notEqual(greetingFor(corpus, 3, 0).text, greetingFor(corpus, 4, 0).text);
});

test('the game\'s part separator is respected, not printed', () => {
  assert.deepEqual(talkParts('One.& Two.&&Three. '), ['One.', 'Two.', 'Three.']);
  assert.deepEqual(talkParts(''), []);
  const joined = [...corpus.plain, ...corpus.province].every((line) => !line.text.includes('&'));
  assert.equal(joined, true, 'no line handed to a player carries a &');
});

/**
 * A real city, assembled and decoded exactly as the scene decodes it.
 *
 * `buildCityLevel` hands back the raw voxel level it stamped; the *decoded* level —
 * the one with `cells`, kinds and floor textures — is `decodeLevel`'s job, and it is
 * what a person has to be placed against. Skipping that step is how this test first
 * failed: the raw level has no `cells` at all, so nobody was placed and the assertion
 * that a city has people in it read as a broken placement rule rather than a broken
 * test.
 */
const cityLevel = async () => {
  const { buildCityLevel } = await import('../../src/game/cityPlan.js');
  const { decodeLevel } = await import('../../src/game/mifLevel.js');
  const mif = await data().mif('CITY1.MIF');
  const city = await buildCityLevel({ data: data(), mif, blocksPerSide: 6, seed: 20232 });
  const inf = await data().inf('TCN.INF');
  const level = decodeLevel(city.level, inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  return { ...city, level, spawn: city.level.spawn ?? level.spawn };
};

test('people stand on real streets, never in a wall or a decoration', async () => {
  const built = await cityLevel();
  const level = built.level;
  const arrival = built.spawn ? { row: built.spawn.x - 0.5, col: built.spawn.z - 0.5 } : null;
  const people = placeTownsfolk({
    level, folk, seed: 4242, count: folkCountFor('city'), arrival, minCells: 4,
  });
  assert.ok(people.length > 0, 'a city has people in it');
  assert.equal(people.length, Math.min(folkCountFor('city'), people.length));
  const cells = new Set();
  for (const person of people) {
    const { row, col } = person.place;
    const cell = level.cells[row * level.width + col];
    assert.ok(cell, 'inside the grid');
    assert.equal(cell.solid, false, `${person.file} at ${row},${col} is not in a wall`);
    assert.equal(Boolean(cell.floor?.chasm), false, 'not over a chasm');
    assert.equal(cell.kind === 'entity', false, 'not standing on a decoration');
    assert.ok(cell.floor?.texture >= 0, 'on a floored cell');
    assert.ok(names.includes(person.file), `${person.file} is the install's`);
    assert.ok(!cells.has(`${row},${col}`), 'two people never share a cell');
    cells.add(`${row},${col}`);
    if (arrival) {
      const distance = Math.hypot(row - arrival.row, col - arrival.col);
      assert.ok(distance >= 4, `arriving on top of somebody is not a greeting (${distance})`);
    }
  }
  // Deterministic: the same seed is the same town, person for person.
  const again = placeTownsfolk({ level, folk, seed: 4242, count: folkCountFor('city'), arrival, minCells: 4 });
  assert.deepEqual(again, people);
  const different = placeTownsfolk({ level, folk, seed: 99, count: folkCountFor('city'), arrival, minCells: 4 });
  assert.notDeepEqual(different, people, 'and a different town is different');
});

test('a settlement\'s size decides how many people are about', () => {
  assert.ok(folkCountFor('city') > folkCountFor('town'));
  assert.ok(folkCountFor('town') > folkCountFor('village'));
  // Raised from 14/9/5 in the "npcs are few in cities" pass; still ordered, still capped
  // by the street cells a settlement has.
  assert.deepEqual([folkCountFor('city'), folkCountFor('town'), folkCountFor('village')], [48, 28, 14]);
  assert.ok(folkCountFor('unknown') > 0, 'and an unrecognised kind still gets somebody');
});

test('an empty install is a town with nobody in it, not a crash', () => {
  assert.deepEqual(folkFromListing([]), []);
  assert.deepEqual(folkFromListing(undefined), []);
  assert.deepEqual(placeTownsfolk({ level: null, folk }), []);
  assert.deepEqual(placeTownsfolk({ level: { cells: [] }, folk }), []);
  assert.equal(greetingFor({ plain: [] }, 1), null);
  assert.deepEqual(topicsFor({ plain: [], province: [] }, { province: 'X' }, 1), []);
  assert.equal(describePerson(undefined), 'a stranger');
});

test('a person is one outfit at five angles, so they can turn to face you', () => {
  const outfits = outfitsFromFolk(folk);
  // Seven armour writings under each of the archive's two figure families, minus the
  // plate figure the second family does not ship (`11…PLT`): 7 + 6 = 13.
  assert.equal(outfits.length, 13, outfits.map((o) => o.key).join(' '));
  for (const outfit of outfits) {
    // Every angle exists and is a different file — `01CHNWLK`…`05CHNWLK` are one person.
    const files = [1, 2, 3, 4, 5].map((v) => viewFileFor(outfit, v));
    assert.equal(new Set(files).size, 5, `${outfit.key}: ${files.join(' ')}`);
    for (const file of files) assert.ok(names.includes(file), `${file} is in GLOBAL.BSA`);
    assert.match(viewFileFor(outfit, 1), new RegExp(`^${outfit.group}1${outfit.armour}WLK\.CFA$`));
  }
  // Out of range is clamped rather than a missing file.
  assert.equal(viewFileFor(outfits[0], 0), viewFileFor(outfits[0], 1));
  assert.equal(viewFileFor(outfits[0], 99), viewFileFor(outfits[0], 5));
});

test('which angle shows a person depends on where they look and where you stand', () => {
  // Someone at the origin looking down +Z. A camera straight in front of them (larger Z)
  // sees their face (view 1); a camera behind them (smaller Z) sees their back (view 5).
  assert.equal(viewFacing(0, 0, 0, 0, 5), 1, 'facing the camera');
  assert.equal(viewFacing(0, 0, 0, 0, -5), 5, 'facing away');
  // To the side is the profile, in the middle.
  assert.equal(viewFacing(0, 0, 0, 5, 0), 3, 'in profile');
  // The other side is the same angle folded: the archive mirrors for it.
  assert.equal(viewFacing(0, 0, 0, -5, 0), 3, 'the other profile');
  // A quarter turn each way is the quarter view.
  assert.equal(viewFacing(0, 0, 0, 5, 5), 2, 'a quarter away');
  assert.equal(viewFacing(0, 0, 0, -5, -5), 4, 'three quarters away');
  // Where the person is looking counts exactly as much as where the camera is: turning the
  // person a half-turn is the same as standing on the other side of them.
  assert.equal(viewFacing(Math.PI, 0, 0, 0, 5), 5);
  assert.equal(viewFacing(Math.PI, 0, 0, 0, -5), 1);
  // And the answer is always one of the five the archive ships.
  for (let i = 0; i < 32; i++) {
    const yaw = (i / 32) * Math.PI * 2;
    const view = viewFacing(yaw, 0, 0, 3, 3);
    assert.ok(view >= 1 && view <= 5, `${yaw} → ${view}`);
  }
});

test('every townsperson the game places knows their outfit and where they are looking', () => {
  const level = { cells: new Array(40 * 40).fill(null).map(() => ({ floor: { texture: 1 }, solid: false })), width: 40, depth: 40, floorY: 1, cellSize: 1 };
  const people = placeTownsfolk({ level, folk, seed: 7, count: 8, arrival: { row: 20, col: 20 }, minCells: 2 });
  assert.equal(people.length, 8);
  for (const person of people) {
    assert.ok(person.outfit && person.outfit.key, 'carries their outfit');
    // The angle they are drawn at is the front one to begin with; the scene turns them
    // from there each frame (`viewFacing`).
    assert.equal(person.file, viewFileFor(person.outfit, 1));
    assert.ok(Number.isFinite(person.facing), 'and a yaw of their own');
    assert.ok(person.facing >= 0 && person.facing < Math.PI * 2);
  }
  // Still deterministic: the same seed is the same people, looking the same way.
  const again = placeTownsfolk({ level, folk, seed: 7, count: 8, arrival: { row: 20, col: 20 }, minCells: 2 });
  assert.deepEqual(again.map((p) => [p.file, Math.round(p.facing * 1e6)]), people.map((p) => [p.file, Math.round(p.facing * 1e6)]));
});
