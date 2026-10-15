// THE CHARACTER LAYER, CHECKED AGAINST ARENA'S OWN DATA AND AGAINST UESP.
//
// `game/character.js` is the one module in this project that is *mostly* authored:
// Arena's class list and tables live in `A.EXE`, which is not in the player's data
// folder (D11), so the tables come from UESP and the questionnaire comes from
// `question.txt`. That split is exactly the kind of thing that rots quietly, so
// this suite holds both halves to something checkable:
//
//   * the eighteen class **names** against the game's own text files — seventeen of
//     them appear in `question.txt`, `template.dat`, `citytxt`, the artifact banks
//     and the talk templates, so a typo in a name is a failing test rather than a
//     class nobody notices is misspelled;
//   * the published answer-combination table against arithmetic, every row of it:
//     eighteen classes present, and every combination summing to the ten questions
//     that were asked;
//   * the dice against the sources: Arena's d20 is 0…20 (UESP, *Dice Rolling*), the
//     discretionary pool is 4d6, and starting Health is 25 + the class die + the
//     Endurance bonus;
//   * the flow in `game/chargen.js` against determinism — same seed and answers,
//     same character — because a save that cannot be reproduced cannot be tested.
//
// Run:  node --test tests/unit/character.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { ArenaRandom } from '../../src/game/arenaRandom.js';
import {
  ATTRIBUTES, ATTRIBUTE_ROLL, CLASSES, CLASS_COMBINATIONS, DISCRETIONARY_DICE, RACES,
  classById, createCharacter, describeCharacter, deserializeCharacter, endHealthBonus,
  rollBaseAttributes, rollDiscretionary, serializeCharacter, suggestClass, tallyAnswers,
} from '../../src/game/character.js';
import {
  answerQuestion, attributeSheet, currentQuestion, describeSelf, finish, newCreation,
  outcome, pickQuestions, progress, spendPoints,
} from '../../src/game/chargen.js';
import { loadArenaText } from '../../src/arena/arenaText.js';
import { ArenaData } from '../../src/arena/arenaData.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = () => new ArenaData(nodeSource(ARENA), { onWarn: () => {} });

test('the class list is Arena\'s eighteen, with no duplicate', () => {
  assert.equal(CLASSES.length, 18, 'Arena has eighteen classes');
  assert.equal(new Set(CLASSES.map((c) => c.id)).size, 18, 'ids are unique keys, not names');
  assert.equal(new Set(CLASSES.map((c) => c.name)).size, 18, 'names are unique');
  for (const klass of CLASSES) {
    assert.ok(klass.hitDie >= 6 && klass.hitDie <= 30, `${klass.name}: hit die ${klass.hitDie}`);
    assert.ok(klass.spellPoints >= 0 && klass.spellPoints <= 3, `${klass.name}: spell points ${klass.spellPoints}`);
    assert.ok(klass.ability.length > 10, `${klass.name} needs an ability line`);
  }
  // The one spelling a reader is likely to "correct": Arena writes Sorceror.
  assert.ok(CLASSES.some((c) => c.id === 'sorceror'), 'the game spells it Sorceror');
  assert.ok(CLASSES.some((c) => c.id === 'acrobat'), 'Acrobat is a class even though no text file names it');
});

test('seventeen of the eighteen class names appear in Arena\'s own text', async () => {
  // The claim is about the *files*, so the test reads the files. Searching this
  // project's parsed banks instead is what made an earlier version of this check
  // report fourteen: a bank's values are records, not strings, and "Barbarian" was
  // sitting in `template.dat` the whole time.
  const TEXT_FILES = ['citytxt', 'dungeon.txt', 'artfact1.dat', 'artfact2.dat', 'template.dat',
    'muguild.dat', 'tavern.dat', 'equip.dat', 'selling.dat', 'question.txt'];
  const arena = data();
  /** @type {Map<string, string>} file -> its ASCII, lower-cased */
  const texts = new Map();
  for (const name of TEXT_FILES) {
    const bytes = await arena.bytes(name);
    if (bytes) texts.set(name, Buffer.from(bytes).toString('latin1').toLowerCase());
  }
  assert.ok(texts.size >= 9, `expected most of Arena's text files, found ${texts.size}`);

  /** Every file containing a name, and how often. */
  const where = (name) => {
    const needle = name.toLowerCase();
    const hits = [];
    for (const [file, text] of texts) {
      const count = [...text.matchAll(new RegExp(needle, 'g'))].length;
      if (count) hits.push(`${file} ×${count}`);
    }
    return hits;
  };

  const missing = [];
  for (const klass of CLASSES) {
    const hits = where(klass.name);
    if (!hits.length) missing.push(klass.name);
  }
  assert.deepEqual(missing, ['Acrobat'], `found ${18 - missing.length} of 18 class names in the text`);

  // The names the research flagged as least certain, pinned to the file that has
  // them — so a parse that loses them fails here rather than quietly thinning out.
  assert.ok(where('healer').some((h) => h.startsWith('template.dat')), 'Healer is in template.dat');
  assert.ok(where('barbarian').some((h) => h.startsWith('template.dat')), 'Barbarian is in template.dat');
  assert.ok(where('spellsword').some((h) => h.startsWith('template.dat')), 'Spellsword is in template.dat');
  assert.ok(where('sorceror').some((h) => h.startsWith('artfact')), 'the Sorceror spelling is in the artifact banks');
  assert.ok(where('warrior').some((h) => h.startsWith('citytxt')), 'a city-state greeting names a warrior');
});

test('the published combinations are complete and all ten questions long', () => {
  const named = new Set(CLASS_COMBINATIONS.map((c) => c.class));
  assert.equal(named.size, 18, 'every class must be reachable from an answer combination');
  for (const klass of CLASSES) assert.ok(named.has(klass.name), `${klass.name} has no combination`);
  for (const row of CLASS_COMBINATIONS) {
    assert.equal(row.thief + row.mage + row.warrior, 10, `${row.class} ${row.thief}/${row.mage}/${row.warrior}`);
    for (const key of ['thief', 'mage', 'warrior']) {
      assert.ok(row[key] >= 0 && row[key] <= 10, `${row.class}: ${key} ${row[key]}`);
    }
  }
  // UESP's own table lists 66 rows over 65 distinct combinations: `5/3/2` is printed
  // under both Acrobat and Assassin, and the page does not say which owns it. The
  // data here is a faithful transcription, so the duplicate is expected — and
  // `suggestClass` resolves it by taking the first row, which is Acrobat.
  const rows = new Map();
  for (const row of CLASS_COMBINATIONS) {
    const key = `${row.thief}/${row.mage}/${row.warrior}`;
    rows.set(key, [...(rows.get(key) ?? []), row.class]);
  }
  const doubled = [...rows].filter(([, classes]) => classes.length > 1);
  assert.equal(CLASS_COMBINATIONS.length, 66, 'the published table has 66 rows');
  assert.equal(rows.size, 65, 'and 65 distinct combinations');
  assert.deepEqual(doubled, [['5/3/2', ['Acrobat', 'Assassin']]], 'the one ambiguity is UESP\'s, and it is recorded here');
});

test('suggestClass takes an exact combination and says so', () => {
  const exact = suggestClass({ thief: 6, mage: 2, warrior: 2 });
  assert.equal(exact.class, 'Acrobat');
  assert.equal(exact.exact, true);
  assert.equal(exact.distance, 0);
  assert.deepEqual(suggestClass({ thief: 10, mage: 0, warrior: 0 }).class, 'Thief');
  assert.deepEqual(suggestClass({ thief: 0, mage: 10, warrior: 0 }).class, 'Mage');
  assert.deepEqual(suggestClass({ thief: 0, mage: 0, warrior: 10 }).class, 'Knight');
});

test('an unlisted combination falls back to the nearest one, and admits it', () => {
  // 7/7/6 is not in the table, and nothing is: every row sums to ten.
  const near = suggestClass({ thief: 4, mage: 4, warrior: 4 });
  assert.equal(near.exact, false);
  assert.ok(near.distance >= 1, `distance ${near.distance}`);
  assert.match(near.note, /nearest listed combination/);
  // The distance must be the city-block distance to the class it picked.
  const row = CLASS_COMBINATIONS.find((c) => c.class === near.class && Math.abs(c.thief - 4) + Math.abs(c.mage - 4) + Math.abs(c.warrior - 4) === near.distance);
  assert.ok(row, 'the reported distance belongs to a real row');
  const better = CLASS_COMBINATIONS.filter((c) => Math.abs(c.thief - 4) + Math.abs(c.mage - 4) + Math.abs(c.warrior - 4) < near.distance);
  assert.deepEqual(better, [], 'nothing may be nearer than what was picked');
});

test('tallyAnswers counts the letters question.txt tags', () => {
  assert.deepEqual(tallyAnswers(['c', 'c', 'l', 'v']), { thief: 2, mage: 1, warrior: 1, total: 4 });
  assert.deepEqual(tallyAnswers([]), { thief: 0, mage: 0, warrior: 0, total: 0 });
  // An unknown letter is not silently counted as a warrior.
  const odd = tallyAnswers(['c', 'x']);
  assert.equal(odd.total, 2);
  assert.equal(odd.thief, 1);
  assert.equal(odd.warrior + odd.mage, 0, 'an unknown letter scores nothing');
});

test('the eight attributes and eight races hold together', () => {
  assert.equal(ATTRIBUTES.length, 8);
  assert.deepEqual(ATTRIBUTES.map((a) => a.abbr), ['STR', 'INT', 'WIL', 'AGI', 'SPD', 'END', 'PER', 'LUC']);
  assert.equal(RACES.length, 8, 'the eight races of Tamriel');
  assert.equal(new Set(RACES.map((r) => r.id)).size, 8);
  for (const race of RACES) {
    for (const gender of ['male', 'female']) {
      assert.equal(race.bases[gender].length, 8, `${race.name} ${gender}`);
      for (const base of race.bases[gender]) assert.ok(base >= 20 && base <= 60, `${race.name} ${gender} base ${base}`);
    }
    assert.ok(race.ability.length > 10, `${race.name} needs an ability line`);
  }
});

test('an attribute is its race base plus Arena\'s d20 (0…20) plus one', () => {
  // UESP, *Dice Rolling*: Arena's d20 rolls 0…20, so base + 1…21. Both ends must be
  // reachable, which is what makes this a range test rather than a sanity check.
  const race = RACES.find((r) => r.id === 'redguard');
  const base = 30;
  assert.equal(race.bases.female[0], base, 'the female Redguard STR base the test reasons about');
  const random = new ArenaRandom(2024);
  const values = [];
  for (let i = 0; i < 400; i++) values.push(rollBaseAttributes(race, 'female', random)[0]);
  assert.ok(values.every((v) => v >= base + 1 && v <= base + 21), `range ${Math.min(...values)}…${Math.max(...values)}`);
  assert.ok(values.includes(base + 1), 'base + 1 is possible: the d20 really does roll 0');
  assert.ok(values.includes(base + 21), 'base + 21 is possible');
  assert.equal(ATTRIBUTE_ROLL, 20);
});

test('the same random stream rolls the same attributes', () => {
  const race = RACES.find((r) => r.id === 'nord');
  const a = rollBaseAttributes(race, 'male', new ArenaRandom(77));
  const b = rollBaseAttributes(race, 'male', new ArenaRandom(77));
  assert.deepEqual(a, b);
  const c = rollBaseAttributes(race, 'male', new ArenaRandom(78));
  assert.notDeepEqual(a, c, 'a different seed is a different character');
});

test('the discretionary pool is 4d6, one to six each', () => {
  const random = new ArenaRandom(5);
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const { rolls, total } = rollDiscretionary(random);
    assert.equal(rolls.length, DISCRETIONARY_DICE);
    assert.equal(rolls.length, 4, 'UESP: 4d6');
    for (const die of rolls) assert.ok(die >= 1 && die <= 6, `die ${die}`);
    assert.equal(total, rolls.reduce((x, y) => x + y, 0));
    assert.ok(total >= 4 && total <= 24);
    seen.add(total);
  }
  assert.ok(seen.size > 12, 'the pool actually varies');
});

test('the Endurance health bonus reaches +5 at 94 and never goes negative', () => {
  // UESP documents the endpoint, not the table: +5 at END 94. The shape below it is
  // this project's reconstruction, so it is checked for the properties it claims.
  assert.equal(endHealthBonus(94), 5);
  assert.equal(endHealthBonus(120), 5);
  assert.equal(endHealthBonus(40), 0);
  assert.equal(endHealthBonus(1), 0, 'a low Endurance gives nothing, never a penalty');
  let previous = -1;
  for (let end = 0; end <= 100; end++) {
    const bonus = endHealthBonus(end);
    assert.ok(bonus >= previous, `monotonic at ${end}`);
    assert.ok(bonus <= 5, `capped at ${end}`);
    previous = bonus;
  }
});

test('a finished character\'s health is 25 plus the class die plus the Endurance bonus', () => {
  const klass = classById('warrior');
  assert.ok(klass);
  for (const endurance of [40, 55, 70, 94]) {
    const character = createCharacter({
      name: 'Die Roller', raceId: 'nord', gender: 'male', classId: 'warrior',
      attributes: [50, 30, 30, 30, 40, endurance, 40, 40],
      random: new ArenaRandom(endurance),
    });
    assert.ok(character.hitDieRoll >= 1 && character.hitDieRoll <= klass.hitDie, `d${klass.hitDie} gave ${character.hitDieRoll}`);
    assert.equal(character.health, 25 + character.hitDieRoll + endHealthBonus(endurance));
    assert.equal(character.maxHealth, character.health);
  }
});

test('spell points are the class multiplier times Intelligence, or nothing at all', () => {
  const attributes = [40, 60, 40, 40, 40, 50, 40, 40];
  const mage = createCharacter({ name: 'Caster', raceId: 'breton', gender: 'male', classId: 'mage', attributes, random: new ArenaRandom(1) });
  assert.equal(mage.spellPoints, Math.round(classById('mage').spellPoints * 60));
  assert.equal(mage.spellPoints, 120, '2 × INT 60');
  const sorceror = createCharacter({ name: 'Absorber', raceId: 'breton', gender: 'male', classId: 'sorceror', attributes, random: new ArenaRandom(1) });
  assert.equal(sorceror.spellPoints, 180, 'the highest multiplier in the game, 3');
  const warrior = createCharacter({ name: 'Fighter', raceId: 'nord', gender: 'male', classId: 'warrior', attributes, random: new ArenaRandom(1) });
  assert.equal(warrior.spellPoints, null, 'a class with no spells has no spell points, not zero');
  assert.equal(warrior.maxSpellPoints, null);
});

test('a character carries its race, class, level and attribute map', () => {
  const character = createCharacter({
    name: 'Testament', raceId: 'redguard', gender: 'female', classId: 'acrobat',
    attributes: [40, 41, 42, 43, 44, 45, 46, 47], random: new ArenaRandom(3),
  });
  assert.equal(character.race, 'Redguard');
  assert.equal(character.className, 'Acrobat');
  assert.equal(character.level, 1);
  assert.equal(character.gold, 0);
  assert.equal(character.attributeMap.endurance, 45);
  assert.deepEqual(Object.keys(character.attributeMap), ATTRIBUTES.map((a) => a.key));
  assert.match(describeCharacter(character), /Testament — female Redguard Acrobat, level 1/);
  assert.equal(describeCharacter(null), 'no character');
});

test('a character needs eight attributes, and rejects a race or class that does not exist', () => {
  const base = { name: 'X', raceId: 'nord', gender: 'male', classId: 'warrior', random: new ArenaRandom(1) };
  assert.throws(() => createCharacter({ ...base, attributes: [1, 2, 3] }), /eight attributes/);
  assert.throws(() => createCharacter({ ...base, raceId: 'dwemer', attributes: [1, 2, 3, 4, 5, 6, 7, 8] }), /unknown race/);
  assert.throws(() => createCharacter({ ...base, classId: 'dragon', attributes: [1, 2, 3, 4, 5, 6, 7, 8] }), /unknown class/);
});

test('a name is clamped to what the sheet can hold', () => {
  const character = createCharacter({
    name: 'A'.repeat(60), raceId: 'argonian', gender: 'male', classId: 'thief',
    attributes: [40, 40, 40, 40, 40, 40, 40, 40], random: new ArenaRandom(2),
  });
  assert.equal(character.name.length, 24);
  const nameless = createCharacter({
    name: '', raceId: 'argonian', gender: 'male', classId: 'thief',
    attributes: [40, 40, 40, 40, 40, 40, 40, 40], random: new ArenaRandom(2),
  });
  assert.equal(nameless.name, 'Nameless');
});

test('a save round-trips, and a damaged one is refused rather than half-loaded', () => {
  const character = createCharacter({
    name: 'Saver', raceId: 'khajiit', gender: 'female', classId: 'nightblade',
    attributes: [40, 55, 40, 50, 50, 40, 40, 50], random: new ArenaRandom(9),
  });
  const round = deserializeCharacter(JSON.parse(JSON.stringify(serializeCharacter(character))));
  assert.deepEqual(round, character);
  assert.equal(deserializeCharacter(null), null);
  assert.equal(deserializeCharacter('a string'), null);
  assert.equal(deserializeCharacter({ name: 'No Class' }), null, 'a class must still exist');
  assert.equal(deserializeCharacter({ ...character, attributes: [1, 2, 3] }), null, 'eight attributes or nothing');
  const patched = deserializeCharacter({ ...character, health: 'lots', gold: undefined, level: 0 });
  assert.equal(patched.gold, 0);
  assert.equal(patched.level, 1, 'a level below one is repaired, not honoured');
  assert.ok(Number.isFinite(patched.health));
});

// ── the flow in game/chargen.js ─────────────────────────────────────────────

test('the questionnaire asks ten of the forty scenarios, in file order', async () => {
  const library = await loadArenaText(data());
  assert.equal(library.questions.length, 40, 'question.txt holds forty scenarios');
  const asked = pickQuestions(library.questions, 4242);
  assert.equal(asked.length, 10, 'UESP: ten questions are asked');
  assert.equal(new Set(asked.map((q) => q.id)).size, 10, 'no scenario is asked twice');
  const order = asked.map((q) => library.questions.findIndex((all) => all.id === q.id));
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, 'the ten are presented in the file\'s own order');
  // Deterministic, so a saved creation can be reproduced from its seed.
  assert.deepEqual(pickQuestions(library.questions, 4242).map((q) => q.id), asked.map((q) => q.id));
  assert.notDeepEqual(pickQuestions(library.questions, 4243).map((q) => q.id), asked.map((q) => q.id));
  for (const question of library.questions) {
    assert.equal(question.answers.length, 3, `scenario ${question.id} has three answers`);
    assert.deepEqual(question.answers.map((a) => a.key), ['a', 'b', 'c']);
    assert.ok(question.answers.every((a) => a.points === 5), 'every answer is worth five points');
    assert.ok(question.answers.every((a) => 'clv'.includes(a.letter)), 'every answer is tagged c, l or v');
  }
});

test('answering all ten questions yields a class from the game\'s own table', async () => {
  const library = await loadArenaText(data());
  const creation = newCreation({ questions: library.questions, seed: 1234 });
  assert.equal(progress(creation).of, 10);
  let state = creation;
  for (let i = 0; i < 10; i++) {
    const question = currentQuestion(state);
    assert.ok(question, `question ${i}`);
    const result = answerQuestion(state, 'b');
    assert.equal(result.ok, true, result.reason);
    state = result.creation;
  }
  assert.equal(currentQuestion(state), null, 'there is nothing left to ask');
  assert.equal(progress(state).done, true);
  const verdict = outcome(state);
  assert.equal(verdict.counts.total, 10);
  assert.ok(verdict.class, `${verdict.suggested.class} is not one of the eighteen`);
  assert.ok(CLASSES.includes(verdict.class));
});

test('an answer the scenario does not offer is refused', async () => {
  const library = await loadArenaText(data());
  const creation = newCreation({ questions: library.questions, seed: 8 });
  assert.equal(answerQuestion(creation, 'd').ok, false);
  assert.match(answerQuestion(creation, 'd').reason, /has no answer/);
  assert.equal(answerQuestion(creation, 'a').ok, true);
});

test('describeSelf needs a name of two letters and a real race', async () => {
  const library = await loadArenaText(data());
  let creation = newCreation({ questions: library.questions, seed: 31 });
  for (let i = 0; i < 10; i++) creation = answerQuestion(creation, 'a').creation;
  assert.equal(describeSelf(creation, { name: 'A', raceId: 'nord' }).ok, false);
  assert.equal(describeSelf(creation, { name: 'Bo', raceId: 'atlantean' }).ok, false);
  assert.equal(describeSelf(creation, { name: 'Bo', raceId: 'nord', classId: 'dragon' }).ok, false);
  const described = describeSelf(creation, { name: '  Bo  ', raceId: 'nord' });
  assert.equal(described.ok, true, described.reason);
  assert.equal(described.creation.name, 'Bo', 'the name is trimmed');
  assert.equal(described.creation.attributes.length, 8);
  assert.ok(described.creation.discretionary >= 4 && described.creation.discretionary <= 24);
});

test('re-describing a character does not re-ask the questionnaire', async () => {
  const library = await loadArenaText(data());
  let creation = newCreation({ questions: library.questions, seed: 99 });
  for (let i = 0; i < 10; i++) creation = answerQuestion(creation, 'c').creation;
  const first = describeSelf(creation, { name: 'Twice', raceId: 'breton', gender: 'male' });
  const second = describeSelf(first.creation, { name: 'Twice', raceId: 'breton', gender: 'male' });
  assert.deepEqual(second.creation.attributes, first.creation.attributes, 'the dice are a fixed stream off the seed');
  assert.deepEqual(second.creation.asked.map((q) => q.id), first.creation.asked.map((q) => q.id));
  // A gender whose bases differ from the male ones: the Bretons are the same either
  // way, which is what an earlier version of this line got wrong.
  const other = describeSelf(first.creation, { name: 'Twice', raceId: 'nord', gender: 'female' });
  assert.notDeepEqual(other.creation.attributes, first.creation.attributes, 'a different gender is a different base');
});

test('the discretionary points cannot be overspent, by a button or by a caller', async () => {
  const library = await loadArenaText(data());
  let creation = newCreation({ questions: library.questions, seed: 5150 });
  for (let i = 0; i < 10; i++) creation = answerQuestion(creation, 'a').creation;
  creation = describeSelf(creation, { name: 'Spender', raceId: 'woodelf' }).creation;
  const pool = creation.discretionary;
  assert.ok(pool >= 4);

  assert.equal(spendPoints(creation, [pool + 1, 0, 0, 0, 0, 0, 0, 0]).ok, false);
  assert.match(spendPoints(creation, [pool + 1, 0, 0, 0, 0, 0, 0, 0]).reason, /that spends/);
  assert.equal(spendPoints(creation, [1, 2, 3]).ok, false, 'spending needs eight entries');
  assert.equal(spendPoints({ ...creation, attributes: null }, [0, 0, 0, 0, 0, 0, 0, 0]).ok, false);

  const all = spendPoints(creation, [pool, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(all.ok, true);
  assert.equal(all.creation.discretionary, 0, 'the pool is spent, not overdrawn');
  assert.equal(all.creation.attributes[0], creation.attributes[0] + pool);
  assert.equal(spendPoints(all.creation, [1, 0, 0, 0, 0, 0, 0, 0]).ok, false, 'nothing is left');
});

test('finish needs a whole character, and the same seed makes the same one twice', async () => {
  const library = await loadArenaText(data());
  let creation = newCreation({ questions: library.questions, seed: 606 });
  assert.equal(finish(creation), null, 'nothing to finish before the questions are answered');
  for (let i = 0; i < 10; i++) creation = answerQuestion(creation, 'b').creation;
  assert.equal(finish(creation), null, 'a nameless, classless creation is not a character');
  creation = describeSelf(creation, { name: 'Determined', raceId: 'highelf', classId: 'mage' }).creation;

  const one = finish(creation, new ArenaRandom(17));
  const two = finish(creation, new ArenaRandom(17));
  assert.ok(one && two);
  assert.deepEqual(one.character, two.character);
  assert.equal(one.character.seed, undefined, 'the seed is on the creation, not the character');
  assert.equal(one.character.created.seed, creation.seed);
  // `created.answers` records the *letter* each answer scored, in order: the letters
  // are what the class was decided from, so they are what a save has to keep.
  const letters = creation.asked.map((question) => question.answers.find((a) => a.key === 'b').letter).join('');
  assert.equal(one.character.created.answers, letters);
  assert.match(one.character.created.answers, /^[clv]{10}$/);
  assert.equal(one.character.spellPoints, Math.round(2 * one.character.attributes[1]));
  assert.equal(one.stats.health, 25 + Math.round(6 / 2) + endHealthBonus(one.character.attributes[5]));
  assert.ok(one.stats.note.includes('health'));
  assert.equal(one.stats.fatigue, null, 'Fatigue is deliberately not implemented');
});

test('the attribute sheet states what each attribute does', async () => {
  const library = await loadArenaText(data());
  let creation = newCreation({ questions: library.questions, seed: 12 });
  for (let i = 0; i < 10; i++) creation = answerQuestion(creation, 'c').creation;
  creation = describeSelf(creation, { name: 'Sheet', raceId: 'darkelf', classId: 'sorceror' }).creation;
  const sheet = attributeSheet(creation);
  assert.equal(sheet.length, 8);
  assert.deepEqual(sheet.map((row) => row.abbr), ATTRIBUTES.map((a) => a.abbr));
  for (const row of sheet) assert.equal(row.value, creation.attributes[ATTRIBUTES.findIndex((a) => a.abbr === row.abbr)]);
  assert.match(sheet[1].bonus, /spell points/, 'INT states the spell points it buys');
  assert.match(sheet[5].bonus, /starting health/, 'END states the health it buys');
});
