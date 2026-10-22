// THE CHARACTER — Arena's own game of who you are.
//
// Arena's character creation is a questionnaire, not a menu: forty scenarios, ten
// of them asked, each answer worth five points on one of three tracks, and the
// resulting counts decide your class. All of that data is in the player's folder —
// `question.txt` holds the scenarios and the tags, and this module holds the
// tables that go with them.
//
// ## What is sourced, and what is authored
//
// Labelled honestly, because a character sheet that quietly invents its numbers is
// worse than one that says it does not know them:
//
//   `RACES`      the eight races and their starting attribute **bases** are from
//                UESP's character-creation table (see SOURCES). Race is the one
//                part of creation with no file behind it.
//   `ATTRIBUTES` the eight attributes and their abbreviations, from UESP.
//   `CLASSES`    the eighteen classes, their hit dice and their spell-point
//                multipliers, from UESP's class table. The *names* are corroborated
//                by the game's own writing: **17 of the 18 appear somewhere in
//                Arena's text files** (`question.txt`, `template.dat`, `citytxt`,
//                the artifact banks, the shopkeeper banks). Only **Acrobat** never
//                appears, and the in-game spelling of Sorceror keeps the `o` —
//                `tests/unit/character.test.mjs` checks the 17 against the files.
//   `CLASS_COMBINATIONS`  UESP's published table of answer-count combinations →
//                class. This is the one piece of the original that the data set
//                cannot supply (`A.EXE` holds the real lookup, D11) and that a
//                sourced table can.
//   `ARCHETYPES` **INFERRED.** The letters in `question.txt` are `v`, `l` and `c`,
//                and nothing readable documents what they stand for. The table
//                above is published in *Thief, Mage, Warrior* order, so the letters
//                are taken as `c` → Thief, `l` → Mage, `v` → Warrior. Logged as
//                S24 in PROGRESS.md; if the mapping is ever pinned down, this is
//                the one line to change.
//   Fatigue      **NOT IMPLEMENTED**, deliberately: sources agree Strength and
//                Endurance raise it but give no formula, and a made-up one would be
//                indistinguishable from a real one. `deriveStats` returns `null`
//                and says why.
//
// ## Sources
//
//   UESP, *Arena: Character Creation* — the questionnaire's shape (ten of forty, the
//     answer-combination table, base + d20 + 1, 4d6 discretionary points).
//   UESP, *Arena: Classes* — hit dice, spell-point multipliers, class abilities.
//   UESP, *Arena: Races* and *Arena: Attributes* — race/gender bases, abilities, and
//     the Endurance health bonus reaching +5 at END 94.
//
// Nothing here is read from `A.EXE` (absent) or from `classes.dat`, whose 216 bytes
// (18 × 12) are consistent with a class table and do not resolve into one — see
// FORMATS §10c.

import { ArenaRandom } from './arenaRandom.js';

/** The eight attributes, in Arena's own order, with its abbreviations. */
export const ATTRIBUTES = Object.freeze([
  { key: 'strength', name: 'Strength', abbr: 'STR' },
  { key: 'intelligence', name: 'Intelligence', abbr: 'INT' },
  { key: 'willpower', name: 'Willpower', abbr: 'WIL' },
  { key: 'agility', name: 'Agility', abbr: 'AGI' },
  { key: 'speed', name: 'Speed', abbr: 'SPD' },
  { key: 'endurance', name: 'Endurance', abbr: 'END' },
  { key: 'personality', name: 'Personality', abbr: 'PER' },
  { key: 'luck', name: 'Luck', abbr: 'LUC' },
]);

/**
 * The eight races: starting attribute bases by gender (STR INT WIL AGI SPD END PER
 * LUC) and the racial ability Arena gives them, as the game's own words.
 */
export const RACES = Object.freeze([
  {
    id: 'argonian', name: 'Argonian',
    bases: { male: [40, 40, 40, 50, 50, 30, 40, 30], female: [40, 40, 40, 40, 40, 40, 40, 40] },
    ability: 'swims faster and tires less easily in water',
  },
  {
    id: 'breton', name: 'Breton',
    bases: { male: [30, 50, 50, 40, 40, 30, 40, 40], female: [30, 50, 50, 40, 40, 30, 40, 40] },
    ability: 'takes half damage from magic-based attacks',
  },
  {
    id: 'darkelf', name: 'Dark Elf',
    bases: { male: [50, 50, 30, 50, 50, 40, 40, 40], female: [40, 50, 30, 40, 40, 40, 40, 40] },
    ability: 'a level/4 bonus to hit and damage with melee and missile weapons',
  },
  {
    id: 'highelf', name: 'High Elf',
    bases: { male: [30, 50, 50, 40, 40, 30, 40, 40], female: [30, 50, 40, 40, 40, 30, 50, 40] },
    ability: 'immune to paralysis',
  },
  {
    id: 'khajiit', name: 'Khajiit',
    bases: { male: [40, 40, 30, 50, 40, 30, 40, 50], female: [40, 40, 30, 40, 50, 30, 40, 50] },
    ability: 'climbs quickly',
  },
  {
    id: 'nord', name: 'Nord',
    bases: { male: [50, 30, 30, 30, 40, 50, 40, 40], female: [40, 30, 40, 40, 40, 40, 40, 50] },
    ability: 'takes half damage from cold-based attacks',
  },
  {
    id: 'redguard', name: 'Redguard',
    bases: { male: [40, 30, 30, 40, 50, 50, 40, 40], female: [30, 30, 30, 50, 50, 50, 40, 40] },
    ability: 'a level/3 bonus to hit and damage with melee weapons, bows excepted',
  },
  {
    id: 'woodelf', name: 'Wood Elf',
    bases: { male: [40, 40, 40, 50, 50, 30, 40, 30], female: [40, 40, 40, 40, 40, 40, 40, 40] },
    ability: 'a level/3 bonus to hit and damage with bows',
  },
]);

/**
 * Arena's d20, and it is not the usual one: UESP's *Dice Rolling* says the game's
 * d20 produces **0…20**, so `base + d20 + 1` adds 1…21 and a base-30 attribute can
 * come out at 31. Kept as a named constant because a reader who assumes 1…20 sees
 * `nextBelow(ATTRIBUTE_ROLL + 1)` in `rollBaseAttributes` and reads it as a bug.
 */
export const ATTRIBUTE_ROLL = 20;
/** The discretionary points a finished creation hands out: 4d6. */
export const DISCRETIONARY_DICE = 4;
/** How many of the questionnaire's forty scenarios one creation asks. */
export const QUESTIONS_ASKED = 10;

/**
 * The three tracks the questionnaire scores, and the letter `question.txt` tags
 * them with. **The letter mapping is INFERRED** — see this file's header.
 */
export const ARCHETYPES = Object.freeze([
  { key: 'thief', letter: 'c', name: 'Thief' },
  { key: 'mage', letter: 'l', name: 'Mage' },
  { key: 'warrior', letter: 'v', name: 'Warrior' },
]);

/**
 * The eighteen classes: hit die, spell-point multiplier (0 = none), critical-strike
 * chance per level, and Arena's class abilities in one line.
 */
export const CLASSES = Object.freeze([
  { id: 'acrobat', name: 'Acrobat', hitDie: 12, spellPoints: 0, critical: 1, ability: 'climbs and jumps better; 1% critical strike per level' },
  { id: 'archer', name: 'Archer', hitDie: 16, spellPoints: 0, critical: 3, ability: '3% critical strike per level with missile weapons' },
  { id: 'assassin', name: 'Assassin', hitDie: 8, spellPoints: 0, critical: 3, ability: '3% critical strike per level' },
  { id: 'barbarian', name: 'Barbarian', hitDie: 30, spellPoints: 0, critical: 0, ability: 'poison immunity and an innate healing bonus' },
  { id: 'bard', name: 'Bard', hitDie: 10, spellPoints: 1, critical: 1, ability: 'spell points, and 1% critical strike per level' },
  { id: 'battlemage', name: 'Battlemage', hitDie: 10, spellPoints: 1.75, critical: 0, ability: 'spellmaker discounts on some effects' },
  { id: 'burglar', name: 'Burglar', hitDie: 10, spellPoints: 0, critical: 1, ability: '100% thievery efficiency; 1% critical strike per level' },
  { id: 'healer', name: 'Healer', hitDie: 8, spellPoints: 2, critical: 0, ability: 'heals faster, and cheaper defensive spells' },
  { id: 'knight', name: 'Knight', hitDie: 18, spellPoints: 0, critical: 0, ability: 'paralysis immunity and automatic equipment repair' },
  { id: 'mage', name: 'Mage', hitDie: 6, spellPoints: 2, critical: 0, ability: 'the most spell points per point of Intelligence' },
  { id: 'monk', name: 'Monk', hitDie: 14, spellPoints: 0, critical: 1.5, ability: '1.5% melee critical per level; harder to hit' },
  { id: 'nightblade', name: 'Nightblade', hitDie: 8, spellPoints: 1.5, critical: 1, ability: '1% critical strike per level; cheaper spellmaker effects' },
  { id: 'ranger', name: 'Ranger', hitDie: 18, spellPoints: 0, critical: 0, ability: 'bonus damage equal to level, and faster travel' },
  { id: 'rogue', name: 'Rogue', hitDie: 8, spellPoints: 0, critical: 1, ability: '1% critical strike per level' },
  { id: 'sorceror', name: 'Sorceror', hitDie: 6, spellPoints: 3, critical: 0, ability: 'absorbs targeted spells as spell points rather than regenerating' },
  { id: 'spellsword', name: 'Spellsword', hitDie: 12, spellPoints: 1.5, critical: 0, ability: 'a fighting mage: 1.5 × INT spell points' },
  { id: 'thief', name: 'Thief', hitDie: 14, spellPoints: 0, critical: 2, ability: '2% critical strike per level' },
  { id: 'warrior', name: 'Warrior', hitDie: 20, spellPoints: 0, critical: 0, ability: 'the largest hit die of the plain fighters' },
]);

/**
 * The published answer-count combinations, in *thief, mage, warrior* counts among
 * the ten questions answered. UESP, *Arena: Character Creation*.
 *
 * The table does not cover all 66 possible outcomes of ten answers — the original
 * presumably has a lookup for each — so `suggestClass` falls back to the nearest
 * listed combination and says that it did.
 *
 * UESP's table lists 66 rows over **65 distinct combinations**: `5/3/2` is printed
 * under both Acrobat and Assassin, and the page does not say which owns it. That is
 * the source's ambiguity, not a transcription slip (`tests/unit/character.test.mjs`
 * pins it), and `find` below resolves it the only defensible way — the first row.
 * Logged as S26 in PROGRESS.md.
 *
 * @type {ReadonlyArray<{class: string, thief: number, mage: number, warrior: number}>}
 */
export const CLASS_COMBINATIONS = Object.freeze([
  { class: 'Acrobat', thief: 6, mage: 2, warrior: 2 }, { class: 'Acrobat', thief: 5, mage: 3, warrior: 2 }, { class: 'Acrobat', thief: 4, mage: 3, warrior: 3 },
  { class: 'Archer', thief: 1, mage: 4, warrior: 5 }, { class: 'Archer', thief: 3, mage: 2, warrior: 5 }, { class: 'Archer', thief: 2, mage: 3, warrior: 5 },
  { class: 'Assassin', thief: 6, mage: 4, warrior: 0 }, { class: 'Assassin', thief: 5, mage: 5, warrior: 0 }, { class: 'Assassin', thief: 5, mage: 4, warrior: 1 }, { class: 'Assassin', thief: 5, mage: 3, warrior: 2 },
  { class: 'Barbarian', thief: 0, mage: 3, warrior: 7 }, { class: 'Barbarian', thief: 1, mage: 2, warrior: 7 }, { class: 'Barbarian', thief: 0, mage: 4, warrior: 6 }, { class: 'Barbarian', thief: 1, mage: 3, warrior: 6 },
  { class: 'Bard', thief: 8, mage: 0, warrior: 2 }, { class: 'Bard', thief: 7, mage: 0, warrior: 3 }, { class: 'Bard', thief: 7, mage: 1, warrior: 2 }, { class: 'Bard', thief: 6, mage: 1, warrior: 3 },
  { class: 'Battlemage', thief: 0, mage: 6, warrior: 4 }, { class: 'Battlemage', thief: 1, mage: 6, warrior: 3 }, { class: 'Battlemage', thief: 1, mage: 5, warrior: 4 },
  { class: 'Burglar', thief: 8, mage: 2, warrior: 0 }, { class: 'Burglar', thief: 7, mage: 3, warrior: 0 }, { class: 'Burglar', thief: 7, mage: 2, warrior: 1 }, { class: 'Burglar', thief: 6, mage: 3, warrior: 1 },
  { class: 'Healer', thief: 0, mage: 8, warrior: 2 }, { class: 'Healer', thief: 0, mage: 7, warrior: 3 }, { class: 'Healer', thief: 2, mage: 6, warrior: 2 }, { class: 'Healer', thief: 2, mage: 5, warrior: 3 },
  { class: 'Knight', thief: 0, mage: 0, warrior: 10 }, { class: 'Knight', thief: 1, mage: 0, warrior: 9 }, { class: 'Knight', thief: 0, mage: 1, warrior: 9 }, { class: 'Knight', thief: 1, mage: 1, warrior: 8 },
  { class: 'Mage', thief: 0, mage: 10, warrior: 0 }, { class: 'Mage', thief: 1, mage: 9, warrior: 0 }, { class: 'Mage', thief: 0, mage: 9, warrior: 1 }, { class: 'Mage', thief: 1, mage: 8, warrior: 1 },
  { class: 'Monk', thief: 5, mage: 0, warrior: 5 }, { class: 'Monk', thief: 0, mage: 5, warrior: 5 }, { class: 'Monk', thief: 3, mage: 3, warrior: 4 },
  { class: 'Nightblade', thief: 3, mage: 7, warrior: 0 }, { class: 'Nightblade', thief: 4, mage: 6, warrior: 0 }, { class: 'Nightblade', thief: 4, mage: 5, warrior: 1 }, { class: 'Nightblade', thief: 4, mage: 4, warrior: 2 },
  { class: 'Ranger', thief: 4, mage: 0, warrior: 6 }, { class: 'Ranger', thief: 3, mage: 1, warrior: 6 }, { class: 'Ranger', thief: 2, mage: 2, warrior: 6 }, { class: 'Ranger', thief: 4, mage: 1, warrior: 5 },
  { class: 'Rogue', thief: 6, mage: 0, warrior: 4 }, { class: 'Rogue', thief: 5, mage: 1, warrior: 4 }, { class: 'Rogue', thief: 4, mage: 2, warrior: 4 },
  { class: 'Sorceror', thief: 2, mage: 8, warrior: 0 }, { class: 'Sorceror', thief: 2, mage: 7, warrior: 1 }, { class: 'Sorceror', thief: 1, mage: 7, warrior: 2 }, { class: 'Sorceror', thief: 3, mage: 6, warrior: 1 },
  { class: 'Spellsword', thief: 3, mage: 5, warrior: 2 }, { class: 'Spellsword', thief: 2, mage: 4, warrior: 4 }, { class: 'Spellsword', thief: 3, mage: 4, warrior: 3 },
  { class: 'Thief', thief: 10, mage: 0, warrior: 0 }, { class: 'Thief', thief: 9, mage: 1, warrior: 0 }, { class: 'Thief', thief: 9, mage: 0, warrior: 1 }, { class: 'Thief', thief: 8, mage: 1, warrior: 1 },
  { class: 'Warrior', thief: 2, mage: 0, warrior: 8 }, { class: 'Warrior', thief: 0, mage: 2, warrior: 8 }, { class: 'Warrior', thief: 3, mage: 0, warrior: 7 }, { class: 'Warrior', thief: 2, mage: 1, warrior: 7 },
]);

/** @param {string} id @returns {object|undefined} */
export const classById = (id) => CLASSES.find((c) => c.id === String(id).toLowerCase());

/** @param {string} id @returns {object|undefined} */
export const raceById = (id) => RACES.find((r) => r.id === String(id).toLowerCase());

/**
 * Count the ten answers' letters.
 *
 * @param {string[]} letters one per answered question, `c`/`l`/`v`
 * @returns {{thief: number, mage: number, warrior: number, total: number}}
 */
export function tallyAnswers(letters) {
  const counts = { thief: 0, mage: 0, warrior: 0, total: letters.length };
  for (const letter of letters) {
    const archetype = ARCHETYPES.find((a) => a.letter === String(letter).toLowerCase());
    if (archetype) counts[archetype.key]++;
  }
  return counts;
}

/**
 * The class a tally suggests, from the published table.
 *
 * Fallbacks, in order and both reported in the result:
 *
 *   1. an exact combination;
 *   2. otherwise the listed combination nearest by city-block distance — which is
 *      the honest answer, since the table does not list every outcome of ten
 *      answers and the original's lookup lives in `A.EXE` (D11).
 *
 * @param {{thief: number, mage: number, warrior: number}} counts
 * @returns {{class: string, exact: boolean, distance: number, note: string}}
 */
export function suggestClass(counts) {
  const thief = counts.thief ?? 0;
  const mage = counts.mage ?? 0;
  const warrior = counts.warrior ?? 0;
  const exact = CLASS_COMBINATIONS.find((c) => c.thief === thief && c.mage === mage && c.warrior === warrior);
  if (exact) {
    return { class: exact.class, exact: true, distance: 0, note: 'the table lists this combination exactly' };
  }
  let best = null;
  for (const combination of CLASS_COMBINATIONS) {
    const distance = Math.abs(combination.thief - thief) + Math.abs(combination.mage - mage) + Math.abs(combination.warrior - warrior);
    if (!best || distance < best.distance) best = { ...combination, distance };
  }
  return {
    class: best.class,
    exact: false,
    distance: best.distance,
    note: `nearest listed combination is ${best.thief}/${best.mage}/${best.warrior} for ${best.class} (${best.distance} away)`,
  };
}

/**
 * Roll a character's base attributes: the race's base plus d20 + 1, per attribute,
 * where Arena's d20 is 0…20 — see `ATTRIBUTE_ROLL`.
 *
 * @param {object} race  from `RACES`
 * @param {'male'|'female'} gender
 * @param {ArenaRandom} random
 * @returns {number[]} eight values, STR…LUC
 */
export function rollBaseAttributes(race, gender, random) {
  const bases = race.bases[gender === 'female' ? 'female' : 'male'];
  return bases.map((base) => base + 1 + random.nextBelow(ATTRIBUTE_ROLL + 1));
}

/**
 * The discretionary points a creation hands out: 4d6, where Arena's own d6 is used
 * through the same generator that generated the cities.
 *
 * @param {ArenaRandom} random
 * @returns {{total: number, rolls: number[]}}
 */
export function rollDiscretionary(random) {
  const rolls = [];
  for (let i = 0; i < DISCRETIONARY_DICE; i++) rolls.push(random.nextBelow(6) + 1);
  return { total: rolls.reduce((a, b) => a + b, 0), rolls };
}

/**
 * The Endurance health bonus. UESP documents the endpoint — **+5 at END 94 or
 * higher** — and no full table, so this is that endpoint, scaled linearly below it
 * and flagged as reconstructed.
 *
 * @param {number} endurance
 * @returns {number} 0…5
 */
export function endHealthBonus(endurance) {
  if (endurance >= 94) return 5;
  return Math.max(0, Math.floor((endurance - 40) / 11));
}

/**
 * Everything the sheet shows that is derived rather than rolled.
 *
 * @param {{classId: string, attributes: number[]}} character
 * @returns {{health: number, spellPoints: number|null, critical: number, fatigue: null, note: string}}
 */
export function deriveStats(character) {
  const klass = classById(character.classId);
  if (!klass) throw new Error(`unknown class "${character.classId}"`);
  const endurance = character.attributes[5];
  const intelligence = character.attributes[1];
  const bonus = endHealthBonus(endurance);
  // Arena's starting Health is 25 + the class die + the Endurance bonus. The die
  // itself is rolled at creation (see `createCharacter`), so the sheet's "health"
  // here is the average the class can expect, and the roll is reported separately.
  const health = 25 + Math.round(klass.hitDie / 2) + bonus;
  return {
    health,
    spellPoints: klass.spellPoints > 0 ? Math.round(klass.spellPoints * intelligence) : null,
    critical: klass.critical,
    // Deliberately absent: see this file's header. Strength and Endurance both
    // raise Fatigue in Arena, and no readable source gives the formula.
    fatigue: null,
    note: `health ${health} = 25 + half of d${klass.hitDie} + ${bonus} endurance`
      + (klass.spellPoints > 0 ? `, spell points ${Math.round(klass.spellPoints * intelligence)} = ${klass.spellPoints} × INT` : ''),
  };
}

/**
 * Finish a character: roll the class die for real Health, and lay the eight
 * attributes out by key.
 *
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.raceId
 * @param {'male'|'female'} opts.gender
 * @param {string} opts.classId
 * @param {number[]} opts.attributes  the eight values, after discretionary points
 * @param {ArenaRandom} [opts.random] for the health die
 * @param {object} [opts.creation]    how it was created, for the sheet to show
 * @returns {object} a plain-JSON character
 */
export function createCharacter(opts) {
  const race = raceById(opts.raceId);
  const klass = classById(opts.classId);
  if (!race) throw new Error(`unknown race "${opts.raceId}"`);
  if (!klass) throw new Error(`unknown class "${opts.classId}"`);
  const random = opts.random ?? new ArenaRandom(opts.name?.length ? opts.name.length * 7919 : 12345);
  const attributes = opts.attributes.slice(0, 8).map((v) => Math.round(v));
  if (attributes.length !== 8) throw new Error(`a character has eight attributes, not ${attributes.length}`);
  const endurance = attributes[5];
  // The class die: Arena's starting roll, 1…hitDie.
  const hitDieRoll = 1 + random.nextBelow(klass.hitDie);
  const health = 25 + hitDieRoll + endHealthBonus(endurance);
  const character = {
    name: String(opts.name || 'Nameless').slice(0, 24),
    raceId: race.id,
    race: race.name,
    gender: opts.gender === 'female' ? 'female' : 'male',
    classId: klass.id,
    className: klass.name,
    attributes,
    attributeMap: Object.fromEntries(ATTRIBUTES.map((a, i) => [a.key, attributes[i]])),
    level: 1,
    health,
    maxHealth: health,
    hitDieRoll,
    spellPoints: klass.spellPoints > 0 ? Math.round(klass.spellPoints * attributes[1]) : null,
    maxSpellPoints: klass.spellPoints > 0 ? Math.round(klass.spellPoints * attributes[1]) : null,
    critical: klass.critical,
    gold: 0,
    // A save-file-safe copy of the look chosen in character creation (`game/playerAppearance.js`).
    // A character made before the visual creator existed has no field, and the scene falls back
    // to their class's body; nothing here invents a look for them.
    appearance: opts.appearance && typeof opts.appearance === 'object' ? { ...opts.appearance } : null,
    created: opts.creation ? { ...opts.creation } : null,
  };
  return character;
}

/** A save-file-safe copy. */
export function serializeCharacter(character) {
  return JSON.parse(JSON.stringify(character));
}

/**
 * Restore a saved character, tolerating a missing or partial one.
 * @param {unknown} saved
 * @returns {object|null} null when there is nothing usable
 */
export function deserializeCharacter(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const source = /** @type {Partial<ReturnType<typeof createCharacter>>} */ (saved);
  if (!source.name || !classById(source.classId) || !raceById(source.raceId)) return null;
  if (!Array.isArray(source.attributes) || source.attributes.length !== 8) return null;
  return {
    ...source,
    attributes: source.attributes.map((v) => Math.round(Number(v) || 0)),
    level: Number.isFinite(source.level) ? Math.max(1, source.level) : 1,
    health: Number.isFinite(source.health) ? source.health : 1,
    maxHealth: Number.isFinite(source.maxHealth) ? source.maxHealth : (source.health ?? 1),
    gold: Number.isFinite(source.gold) ? source.gold : 0,
  };
}

/**
 * A one-line summary for the HUD and the tests.
 * @param {object} character
 * @returns {string}
 */
export function describeCharacter(character) {
  if (!character) return 'no character';
  return `${character.name} — ${character.gender} ${character.race} ${character.className}, level ${character.level}, `
    + `${character.health}/${character.maxHealth} health`
    + (character.spellPoints == null ? '' : `, ${character.spellPoints} spell points`);
}
