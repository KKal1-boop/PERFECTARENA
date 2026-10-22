// CHARACTER CREATION, AS A FLOW.
//
// Arena's creation is a conversation, and this module is the conversation's state
// without any of its rendering: which ten of the forty scenarios are being asked,
// what has been answered, which class the answers suggest, what the dice gave, and
// how those points can be spent. `scenes/chargen.js` is the panel that draws it.
//
// Everything here is deterministic in `(questions, seed)`, which is what makes the
// whole creation testable without a browser: a seed plus a list of answer keys is a
// character, and `tests/unit/character.test.mjs` plays dozens of them.
//
// The division of labour with `game/character.js` is deliberate: that module owns
// the *tables* (races, classes, the published combination lookup) and this one owns
// the *order of events* — ask, tally, suggest, roll, spend, finish.

import { ArenaRandom } from './arenaRandom.js';
import {
  CLASSES, DISCRETIONARY_DICE, QUESTIONS_ASKED, RACES, ATTRIBUTES,
  createCharacter, deriveStats, endHealthBonus, rollBaseAttributes, rollDiscretionary,
  suggestClass, tallyAnswers,
} from './character.js';
import { ATTRIBUTE_ROLL } from './character.js';

/** XORed into a creation's seed for the attribute rolls, so the same seed produces
 * the same character while the two draws stay independent. */
const CHARGEN_ATTRIBUTE_STREAM = 0xa77c; 

/**
 * @typedef {object} Creation
 * @property {number} seed          the creation's own seed; the dice come from it
 * @property {import('../arena/arenaText.js').Question[]} asked  the ten scenarios
 * @property {{questionId: number, key: string, letter: string}[]} answers
 * @property {string} name
 * @property {string|null} raceId
 * @property {'male'|'female'} gender
 * @property {string|null} classId
 * @property {number[]|null} attributes   as rolled
 * @property {number} discretionary       points still to spend
 * @property {number[]} rolls             the 4d6 discretionary rolls, for the sheet
 * @property {boolean} finished
 */

/**
 * Choose which scenarios are asked, and in which order.
 *
 * The original asks ten of its forty and the data set does not record *which*
 * ten — the selection is drawn from the seed instead, without replacement, so a
 * creation is reproducible and two characters rarely meet the same questions. The
 * order presented is the file's own order, not the draw's: a question's text reads
 * as part of a life story, and shuffling it would invent a narrative the game does
 * not have.
 *
 * @param {import('../arena/arenaText.js').Question[]} questions all forty
 * @param {number} seed
 * @returns {import('../arena/arenaText.js').Question[]} ten of them, file order
 */
export function pickQuestions(questions, seed) {
  const random = new ArenaRandom((seed >>> 0) ^ 0x5eed1e);
  const pool = questions.slice();
  const chosen = new Set();
  const wanted = Math.min(QUESTIONS_ASKED, pool.length);
  while (chosen.size < wanted) {
    const index = random.nextBelow(pool.length);
    // Questions are keyed by the file's own number, which is unique.
    chosen.add(pool[index].id);
  }
  return pool.filter((q) => chosen.has(q.id));
}

/**
 * Begin a creation.
 *
 * @param {object} opts
 * @param {import('../arena/arenaText.js').Question[]} opts.questions
 * @param {number} [opts.seed]
 * @param {ArenaRandom} [opts.random]
 * @returns {Creation}
 */
export function newCreation(opts) {
  const random = opts.random ?? new ArenaRandom((opts.seed ?? (Date.now() & 0xffff)) >>> 0);
  const seed = random.getSeed();
  return {
    seed,
    asked: pickQuestions(opts.questions, seed),
    answers: [],
    name: '',
    raceId: null,
    gender: 'male',
    classId: null,
    attributes: null,
    discretionary: 0,
    rolls: [],
    finished: false,
  };
}

/** The question waiting to be answered, or null when the ten are done. */
export function currentQuestion(creation) {
  return creation.asked[creation.answers.length] ?? null;
}

/**
 * Answer the question in front of us.
 *
 * @param {Creation} creation
 * @param {string} key  `a`, `b` or `c`
 * @returns {{ok: boolean, reason?: string, creation: Creation}}
 */
export function answerQuestion(creation, key) {
  const question = currentQuestion(creation);
  if (!question) return { ok: false, reason: 'there are no questions left', creation };
  const answer = question.answers.find((a) => a.key === key);
  if (!answer) return { ok: false, reason: `${question.id} has no answer "${key}"`, creation };
  return {
    ok: true,
    creation: {
      ...creation,
      answers: [...creation.answers, { questionId: question.id, key: answer.key, letter: answer.letter }],
    },
  };
}

/**
 * Where the creation has got to, for a progress line.
 * @param {Creation} creation
 */
export function progress(creation) {
  return {
    answered: creation.answers.length,
    of: creation.asked.length,
    done: creation.answers.length >= creation.asked.length,
  };
}

/** The answer letters so far, in order. */
export const answerLetters = (creation) => creation.answers.map((a) => a.letter);

/**
 * The verdict of the questionnaire: the three tallies, and the class they suggest.
 *
 * @param {Creation} creation
 * @returns {{counts: object, suggested: object, class: object|null}}
 */
export function outcome(creation) {
  const counts = tallyAnswers(answerLetters(creation));
  const suggested = suggestClass(counts);
  return { counts, suggested, class: CLASSES.find((c) => c.name === suggested.class) ?? null };
}

/**
 * Set the name, race, gender and class, and roll the attributes.
 *
 * The class is set from the questionnaire's suggestion unless the player has named
 * another one: Arena assigns a class rather than offering a list, but a mod that
 * cannot be overridden is a worse mod, so the panel shows the suggestion, explains
 * it, and allows another. Logged as S25 in PROGRESS.md.
 *
 * @param {Creation} creation
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.raceId
 * @param {'male'|'female'} [opts.gender]
 * @param {string} [opts.classId]  defaults to the questionnaire's suggestion
 * @returns {{ok: boolean, reason?: string, creation: Creation}}
 */
export function describeSelf(creation, opts) {
  const race = RACES.find((r) => r.id === opts.raceId);
  if (!race) return { ok: false, reason: `unknown race "${opts.raceId}"`, creation };
  const name = String(opts.name ?? '').trim();
  if (name.length < 2) return { ok: false, reason: 'a name is at least two letters', creation };
  const suggestion = outcome(creation);
  const classId = opts.classId ?? suggestion.class?.id ?? 'warrior';
  if (!CLASSES.some((c) => c.id === classId)) return { ok: false, reason: `unknown class "${classId}"`, creation };

  // A named constant, not a magic number: the attribute roll is a different draw
  // from the question draw, so re-describing a character cannot re-ask questions.
  const random = new ArenaRandom((creation.seed ^ CHARGEN_ATTRIBUTE_STREAM) >>> 0);
  const attributes = rollBaseAttributes(race, opts.gender ?? creation.gender, random);
  const discretionary = rollDiscretionary(random);
  return {
    ok: true,
    creation: {
      ...creation,
      name,
      raceId: race.id,
      gender: opts.gender === 'female' ? 'female' : 'male',
      classId,
      attributes,
      discretionary: discretionary.total,
      rolls: discretionary.rolls,
    },
  };
}

/**
 * Spend the discretionary points the dice gave.
 *
 * `spend` is one entry per attribute, and only the points that are left are
 * allowed through — so a caller cannot hand itself a hero by asking for more.
 *
 * @param {Creation} creation
 * @param {number[]} spend  eight values, each how many points to add
 * @returns {{ok: boolean, reason?: string, creation: Creation}}
 */
export function spendPoints(creation, spend) {
  if (!creation.attributes) return { ok: false, reason: 'the attributes have not been rolled yet', creation };
  if (!Array.isArray(spend) || spend.length !== ATTRIBUTES.length) {
    return { ok: false, reason: `spending needs ${ATTRIBUTES.length} entries`, creation };
  }
  const wanted = spend.map((v) => Math.max(0, Math.round(Number(v) || 0)));
  const total = wanted.reduce((a, b) => a + b, 0);
  if (total > creation.discretionary) {
    return { ok: false, reason: `that spends ${total} of ${creation.discretionary} points`, creation };
  }
  const attributes = creation.attributes.map((v, i) => v + wanted[i]);
  return {
    ok: true,
    creation: { ...creation, attributes, discretionary: creation.discretionary - total, spent: wanted },
  };
}

/**
 * Finish: turn the creation into a character, and say what the dice did.
 *
 * @param {Creation} creation
 * @param {ArenaRandom} [random] for the class's health die
 * @returns {{character: object, stats: object}|null} null when the character is not ready
 */
export function finish(creation, random) {
  if (!creation.attributes || !creation.raceId || !creation.classId || !creation.name) return null;
  const character = createCharacter({
    name: creation.name,
    raceId: creation.raceId,
    gender: creation.gender,
    classId: creation.classId,
    attributes: creation.attributes,
    random,
    // **The chosen look is the character's** (the visual creator's answer): a sprite id and
    // the skin/hair that repaint it, saved with everything else so the third-person figure
    // is the person the player built rather than their class's default armour.
    appearance: creation.appearance ?? null,
    creation: {
      seed: creation.seed,
      questions: creation.asked.length,
      answers: answerLetters(creation).join(''),
      discretionary: creation.rolls.join('+'),
    },
  });
  return { character, stats: deriveStats(character) };
}

/**
 * The attribute table for the panel: name, abbreviation, base, spent, total, and
 * what the total does.
 *
 * @param {Creation} creation
 * @returns {{abbr: string, name: string, value: number, bonus: string}[]}
 */
export function attributeSheet(creation) {
  const attributes = creation.attributes ?? [];
  return ATTRIBUTES.map((attribute, i) => {
    const value = attributes[i] ?? 0;
    let bonus = '';
    if (attribute.key === 'endurance') bonus = `+${endHealthBonus(value)} starting health`;
    if (attribute.key === 'intelligence') {
      const klass = CLASSES.find((c) => c.id === creation.classId);
      bonus = klass && klass.spellPoints > 0 ? `${Math.round(klass.spellPoints * value)} spell points` : 'no spell points for this class';
    }
    return { abbr: attribute.abbr, name: attribute.name, value, bonus };
  });
}

/** The dice a roll came from, for the panel to be honest about its numbers. */
export const ROLL_NOTE = `each attribute is the race's base + d${ATTRIBUTE_ROLL} + 1, then ${DISCRETIONARY_DICE}d6 to place`;
