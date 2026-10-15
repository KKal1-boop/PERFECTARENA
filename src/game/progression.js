// PROGRESSION — what a level is worth, and what it changes.
//
// The fight has paid experience since `scenes/interior.js` learned to count it
// (`game/monsters.js`'s EExp rule: UESP's `HP × EExp/HP + EExperience`), and until this
// module that number went nowhere: it was printed on the HUD, saved on the character,
// and a level-1 warrior stayed a level-1 warrior through a whole dungeon. This is the
// other half — the thresholds, the roll, and the eight attributes the player spends it
// on.
//
// ## What is sourced, and what is authored
//
//   `XP_COLUMNS` / `XP_TABLE`  **UESP, *Arena: Classes*.** The cumulative experience each
//                class needs, as a five-column table (A–E) with a class→column map, and
//                the rule the table follows: *"Each level up to 10 requires 1.875× the
//                previous level's experience requirement, rounded down. For levels after
//                10, the previous level's requirement is multiplied by 1.5 and rounded
//                down."* `xpForLevel` is that rule; `XP_TABLE` is the published numbers,
//                and `tests/unit/progression.test.mjs` holds the two together — all five
//                columns, levels 2…20. The table stops at level 20; the rule does not,
//                and UESP's own class page notes the *class-dependent* maxima it lists
//                (38 for the E classes, 31 for the C ones) are unsourced, so this module
//                keeps the rule and does not invent a cap.
//   attribute points  **UESP, *Arena: Hints*:** *"Every level gives you a random number
//                of attribute points (from 3 to 6) to distribute as you see fit."* The
//                player chooses where they go, which is why the level-up is a panel and
//                not an automatic award — the game asks.
//   the health roll  **UESP, *Arena: Hints* and *Arena: Classes*:** a level's health gain
//                is a random roll of 1…the class's hit die, plus the Endurance bonus —
//                the same shape as the starting roll in `character.js` (`25 + hitDie +
//                bonus`), and the endowment's own `endHealthBonus` is reused rather than
//                re-derived.
//   `ATTRIBUTE_MAX`  **100** — UESP, *Arena: Attributes* (the Endurance health bonus
//                reaches its maximum *"+10 at 100"*, and 100 is the value a character is
//                described as capping at).
//   the message    **NOT TRANSCRIBED.** The game's own line for a level gained is
//                reported second-hand as *"You have gained a level of experience!"*; no
//                source this project could reach transcribes the allocation prompt. The
//                panel says what has happened in the project's own words and says that
//                the wording is the project's, the same bargain the combat HUD makes.
//
// ## One deliberate departure from the original
//
// Arena has a **stuck screen**: the 1994 Arena FAQ warns *"be certain NOT to go to 100 for
// each attribute, since that will hang the game when the character next gains a level and
// there is NO place to put the points"*, and players still report it. This module refuses
// to reproduce a hang: an attribute at `ATTRIBUTE_MAX` cannot be given a point, the panel
// marks it full, and if *every* attribute is full the level is simply taken and says so.
// The defect is real and worth keeping in the record; the hang is not worth keeping in the
// game.

import { classById, endHealthBonus } from './character.js';

/**
 * Which of UESP's five experience columns a class is in.
 *
 * * **A** Thief · **B** Warrior · **C** Acrobat, Assassin, Bard, Burglar, Mage, Rogue ·
 * **D** Archer, Barbarian, Knight, Monk, Ranger ·
 * **E** Battlemage, Healer, Nightblade, Sorceror, Spellsword
 */
export const XP_COLUMN_BY_CLASS = Object.freeze({
  thief: 'A',
  warrior: 'B',
  acrobat: 'C', assassin: 'C', bard: 'C', burglar: 'C', mage: 'C', rogue: 'C',
  archer: 'D', barbarian: 'D', knight: 'D', monk: 'D', ranger: 'D',
  battlemage: 'E', healer: 'E', nightblade: 'E', sorceror: 'E', spellsword: 'E',
});

/** The experience a level-2 character of each column needs — the table's own first row. */
export const XP_COLUMNS = Object.freeze({ A: 800, B: 900, C: 1000, D: 1100, E: 1200 });

/**
 * UESP's published cumulative experience, as printed: the level reached → the five
 * columns' requirements. `xpForLevel` computes these numbers; this is the record they
 * are checked against, and the table a reader can see without running anything.
 */
export const XP_TABLE = Object.freeze({
  2: [800, 900, 1000, 1100, 1200],
  3: [1500, 1687, 1875, 2062, 2250],
  4: [2812, 3163, 3515, 3866, 4218],
  5: [5272, 5930, 6590, 7248, 7908],
  6: [9885, 11118, 12356, 13590, 14827],
  7: [18534, 20846, 23167, 25481, 27800],
  8: [34751, 39086, 43438, 47776, 52125],
  9: [65158, 73286, 81446, 89580, 97734],
  10: [122171, 137411, 152711, 167962, 183251],
  11: [183256, 206116, 229066, 251943, 274876],
  12: [274884, 309174, 343599, 377914, 412314],
  13: [412326, 463761, 515398, 566871, 618471],
  14: [618489, 695641, 773097, 850306, 927706],
  15: [927733, 1043461, 1159645, 1275459, 1391559],
  16: [1391599, 1565191, 1739467, 1913188, 2087338],
  17: [2087398, 2347786, 2609200, 2869782, 3131007],
  18: [3131097, 3521679, 3913800, 4304673, 4696510],
  19: [4696645, 5282518, 5870700, 6457009, 7044765],
  20: [7044967, 7923777, 8806050, 9685513, 10567147],
});

/** The rule the table follows, as UESP's *Arena: Classes* states it. */
export const XP_RULE = 'up to level 10 each level needs 1.875 × the last, rounded down; after that 1.5 ×';

/** The number of attribute points a level hands out, per UESP's *Arena: Hints*. */
export const ATTRIBUTE_POINTS_MIN = 3;
export const ATTRIBUTE_POINTS_MAX = 6;

/** The most an attribute can reach, per UESP's *Arena: Attributes*. */
export const ATTRIBUTE_MAX = 100;

/** Where these numbers come from, in one line each, for the HUD and the tests. */
export const XP_SOURCE = 'UESP, Arena: Classes — the five columns and their rule ("' + XP_RULE + '")';
export const ATTRIBUTE_POINTS_SOURCE = 'UESP, Arena: Hints — "a random number of attribute points (from 3 to 6) to distribute as you see fit"';
export const HEALTH_GAIN_SOURCE = 'UESP, Arena: Hints / Classes — 1…hit die, plus the Endurance bonus';
export const ATTRIBUTE_MAX_SOURCE = 'UESP, Arena: Attributes — 100 is the maximum';

/** The columns, in table order, for iterating the published rows. */
export const XP_COLUMN_ORDER = Object.freeze(['A', 'B', 'C', 'D', 'E']);

/** @param {string} classId @returns {'A'|'B'|'C'|'D'|'E'|null} */
export function xpColumnForClass(classId) {
  return XP_COLUMN_BY_CLASS[String(classId ?? '').toLowerCase()] ?? null;
}

/**
 * The experience a character of this class needs to **reach** `level`.
 *
 * Level 1 is zero (a character starts there), the level-2 requirement is the column's own
 * base, and every level after that is the previous one times 1.875 while the character is
 * climbing to 10 and 1.5 from there on — UESP's rule, applied, rather than the table
 * transcribed: the two agree on all 19 published rows and the function keeps working past
 * the table's end, which is where the class maxima UESP lists without a source live.
 *
 * @param {string} classId
 * @param {number} level
 * @returns {number} cumulative experience, or `Infinity` for a class this install has none for
 */
export function xpForLevel(classId, level) {
  const column = xpColumnForClass(classId);
  const wanted = Math.floor(Number(level) || 1);
  if (!column) return Number.POSITIVE_INFINITY;
  if (wanted <= 1) return 0;
  let total = XP_COLUMNS[column];
  for (let reached = 3; reached <= wanted; reached++) {
    total = Math.floor(total * (reached <= 10 ? 1.875 : 1.5));
  }
  return total;
}

/**
 * The level an amount of experience has earned — the inverse of `xpForLevel`.
 *
 * @param {string} classId
 * @param {number} xp
 * @returns {number} at least 1
 */
export function levelForXp(classId, xp) {
  const have = Math.max(0, Number(xp) || 0);
  if (!xpColumnForClass(classId)) return 1;
  let level = 1;
  // 60 levels is past every maximum UESP lists for any column, so this is a bound on a
  // runaway (`xpForLevel` is multiplied by at least 1.5 a level) rather than a cap on play.
  while (level < 60 && have >= xpForLevel(classId, level + 1)) level++;
  return level;
}

/**
 * Where a character stands: the level on the sheet, the level the experience has earned, and
 * the distance to the next threshold.
 *
 * **`level` and `earned` are two different numbers on purpose.** A character who has just
 * passed a threshold has earned a level the sheet has not taken yet — that is what a pending
 * level-up *is* — so the distance reported (`into`, `needed`, `next`) is measured from the
 * level the experience has earned, and `pendingLevels` is the difference between the two. The
 * HUD reads both, and a caller that only wants "is something due" wants `pendingLevels`.
 *
 * @param {{classId: string, level?: number, xp?: number}} character
 * @returns {{level: number, earned: number, xp: number, next: number|null, needed: number|null, into: number}}
 */
export function progressOf(character) {
  const xp = Math.max(0, Number(character?.xp) || 0);
  const level = Math.max(1, Number(character?.level) || 1);
  const earned = levelForXp(character?.classId, xp);
  const next = xpForLevel(character?.classId, earned + 1);
  if (!Number.isFinite(next)) return { level, earned, xp, next: null, needed: null, into: 0 };
  return { level, earned, xp, next, needed: next - xp, into: xp - xpForLevel(character?.classId, earned) };
}

/**
 * How many levels an amount of experience is worth, over and above the character's own.
 *
 * @param {{classId: string, level?: number, xp?: number}} character
 * @returns {number} 0 when nothing is due
 */
export function pendingLevels(character) {
  const earned = levelForXp(character?.classId, character?.xp);
  return Math.max(0, earned - Math.max(1, Number(character?.level) || 1));
}

/**
 * The attribute points this level hands out: 3…6, on the engine's own generator.
 * @param {{nextBelow: (n: number) => number}} random
 * @returns {number}
 */
export function rollAttributePoints(random) {
  return ATTRIBUTE_POINTS_MIN + random.nextBelow(ATTRIBUTE_POINTS_MAX - ATTRIBUTE_POINTS_MIN + 1);
}

/**
 * The health this level hands out: 1…the class's hit die, plus the Endurance bonus.
 *
 * **The bonus is the one in force when the level is taken**, before this level's own points
 * are spent: UESP's *Attributes* page says the Endurance health bonus applies to
 * *subsequent* hit-die rolls and is not retroactive, so a player who puts their points into
 * Endurance feels it on the next level, not this one.
 *
 * @param {{hitDie: number}} klass
 * @param {number} endurance
 * @param {{nextBelow: (n: number) => number}} random
 * @returns {number}
 */
export function rollHealthGain(klass, endurance, random) {
  return 1 + random.nextBelow(Math.max(1, klass.hitDie)) + endHealthBonus(endurance);
}

/**
 * Take a level: the points are spent, the health is added, the derived numbers move.
 *
 * `allocation` is a partial map of attribute keys to points (`{strength: 2, agility: 1}`)
 * and must add up to exactly `points` — the panel holds the roll, so a caller that has not
 * spent them all is a caller with a bug rather than a character mid-decision. An attribute
 * at `ATTRIBUTE_MAX` refuses its points (see this file's header: the original hangs here)
 * and the refusal is reported rather than silently swallowed.
 *
 * @param {object} opts
 * @param {object} opts.character
 * @param {number} opts.points      what `rollAttributePoints` rolled for this level
 * @param {Record<string, number>} opts.allocation
 * @param {{nextBelow: (n: number) => number}} [opts.random]
 * @returns {{character: object, health: number, spent: Record<string, number>, refused: string|null}}
 */
export function applyLevel({ character, points, allocation, random }) {
  const klass = classById(character?.classId);
  if (!klass) throw new Error(`unknown class "${character?.classId}"`);
  const wanted = Math.max(0, Math.floor(Number(points) || 0));
  const asked = allocation ?? {};
  const keys = ['strength', 'intelligence', 'willpower', 'agility', 'speed', 'endurance', 'personality', 'luck'];
  let left = wanted;
  let refused = null;
  const attributes = character.attributes.slice(0, 8).map((v) => Math.round(Number(v) || 0));
  const spent = {};
  // In Arena's own attribute order, so a scripted allocation of *n* points into a single
  // attribute is deterministic and the panel's keys line up with the sheet's rows.
  for (const key of keys) {
    let wish = Math.max(0, Math.floor(Number(asked[key]) || 0));
    if (!wish) continue;
    const index = keys.indexOf(key);
    const room = Math.max(0, ATTRIBUTE_MAX - attributes[index]);
    const took = Math.min(wish, room, left);
    if (took < wish) refused = `${key} is at its maximum of ${ATTRIBUTE_MAX}`;
    attributes[index] += took;
    left -= took;
    if (took) spent[key] = took;
  }
  // Whatever is left after the allocation is unspent: the level is still taken — a player
  // whose eight attributes are all full does not lose the level, and the game does not hang.
  const rolled = rollHealthGain(klass, character.attributes[5], random ?? fallbackRandom());
  const endurance = attributes[5];
  const intelligence = attributes[1];
  const next = {
    ...character,
    attributes,
    attributeMap: Object.fromEntries(keys.map((key, i) => [key, attributes[i]])),
    level: Math.max(1, Number(character.level) || 1) + 1,
    maxHealth: (Number(character.maxHealth) || 1) + rolled,
    health: (Number(character.health) || 1) + rolled,
    // Spell points are **not** a per-level award: they are the class's own multiplier times
    // Intelligence (`character.js`'s header, and UESP's *Classes*), so a level raises them
    // only by way of the Intelligence the player just spent points on — and what rises is the
    // *maximum*, with the points already spent staying spent. Marked here because a level that
    // refilled the book would read as an Arena rule and is not one.
    maxSpellPoints: klass.spellPoints > 0 ? Math.round(klass.spellPoints * intelligence) : character.maxSpellPoints ?? null,
    spellPoints: klass.spellPoints > 0
      ? Math.min(Number(character.spellPoints) || 0, Math.round(klass.spellPoints * intelligence))
      : character.spellPoints ?? null,
    lastLevel: {
      gained: rolled,
      points: wanted,
      spent: { ...spent },
      unspent: left,
      enduranceBefore: endHealthBonus(character.attributes[5]),
      enduranceAfter: endHealthBonus(endurance),
    },
  };
  return { character: next, health: rolled, spent, refused };
}

/**
 * A generator of the shape the engine's own `ArenaRandom` has, for a caller with none.
 *
 * `applyLevel` is a pure function over its inputs and the tests call it without a game:
 * a level-up with no generator still has to produce a health roll, so this is a small
 * counter-based one rather than a `Math.random` — a level-up is *data*, and the same
 * character taken twice should come out the same.
 */
function fallbackRandom(seed = 0x2f6e2b1) {
  let state = seed >>> 0;
  return {
    nextBelow(limit) {
      // A 32-bit LCG (the same shape as `arenaRandom.js`), stepped once per call.
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return limit > 0 ? state % limit : 0;
    },
  };
}

/** What the panel tells the player, in the project's own words (see this file's header). */
export function levelUpText(character, gain, pending) {
  const klass = classById(character.classId);
  const name = character.name ?? 'you';
  const more = pending > 1 ? ` ${pending - 1} more level${pending - 1 === 1 ? '' : 's'} await${pending - 1 === 1 ? 's' : ''}.` : '';
  return `**${name} has gained a level of experience** — level ${character.level}${klass ? `, ${klass.name}` : ''}.`
    + ` Health ${gain.health > 0 ? `+${gain.health}` : '+0'}, and ${gain.points} attribute point${gain.points === 1 ? '' : 's'} to place.${more}`;
}
