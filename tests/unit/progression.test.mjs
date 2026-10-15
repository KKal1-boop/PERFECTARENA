// The level-up, held against the only published source there is.
//
// UESP prints a five-column cumulative experience table (A–E by class) and the rule it
// follows; this suite checks the rule reproduces the table **row for row**, every column,
// levels 2…20 — so the day the rule and the table disagree, the suite says which row. The
// rest is the level-up itself: 3…6 points, a hit-die roll plus the Endurance bonus, a cap at
// 100, and the original's hang (all eight attributes full with points left over) not
// reproduced.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTRIBUTE_MAX, ATTRIBUTE_POINTS_MAX, ATTRIBUTE_POINTS_MIN, XP_COLUMNS, XP_COLUMN_ORDER, XP_TABLE,
  applyLevel, levelForXp, pendingLevels, progressOf, rollAttributePoints, rollHealthGain,
  xpColumnForClass, xpForLevel,
} from '../../src/game/progression.js';
import { CLASSES, classById, createCharacter } from '../../src/game/character.js';

/** A generator that walks a scripted list, then repeats its last value. */
const scripted = (...values) => {
  let i = 0;
  return { nextBelow: (limit) => (i < values.length ? values[i++] % limit : values.at(-1) % limit) };
};

/** A finished character of a given class, deterministically. */
function characterOf(classId) {
  return createCharacter({
    name: 'Testine',
    raceId: 'breton',
    gender: 'female',
    classId,
    attributes: [50, 50, 50, 50, 50, 50, 50, 50],
    random: scripted(3),
  });
}

test('every class is in one of UESP\'s five experience columns', () => {
  for (const klass of CLASSES) {
    const column = xpColumnForClass(klass.id);
    assert.ok(column, `${klass.id} has no experience column`);
    assert.ok(XP_COLUMN_ORDER.includes(column), `${klass.id} is in an unknown column ${column}`);
  }
  assert.equal(XP_COLUMN_ORDER.length, 5);
  assert.equal(xpColumnForClass('not-a-class'), null);
});

test('the rule reproduces UESP\'s published table, row for row, column for column', () => {
  const classOfColumn = { A: 'thief', B: 'warrior', C: 'mage', D: 'knight', E: 'healer' };
  for (const column of XP_COLUMN_ORDER) {
    const klass = classOfColumn[column];
    assert.equal(xpColumnForClass(klass), column, `${klass} should be column ${column}`);
    for (const [level, row] of Object.entries(XP_TABLE)) {
      assert.equal(xpForLevel(klass, Number(level)), row[XP_COLUMN_ORDER.indexOf(column)],
        `column ${column}, level ${level}`);
    }
  }
});

test('level 1 is free and the climb is monotonic', () => {
  assert.equal(xpForLevel('mage', 1), 0);
  assert.equal(xpForLevel('mage', 0), 0);
  for (let level = 2; level <= 30; level++) {
    assert.ok(xpForLevel('mage', level) > xpForLevel('mage', level - 1), `level ${level} is not dearer than ${level - 1}`);
  }
});

test('the table ends at 20 and the rule keeps going, because UESP\'s class maxima are unsourced', () => {
  assert.equal(xpForLevel('healer', 20), XP_TABLE[20][4]);
  assert.equal(xpForLevel('healer', 21), Math.floor(XP_TABLE[20][4] * 1.5));
  assert.ok(Number.isFinite(xpForLevel('healer', 40)));
});

test('a class the install has none for needs infinite experience rather than level 2', () => {
  assert.equal(xpForLevel('sorceror-from-another-game', 5), Number.POSITIVE_INFINITY);
  assert.equal(levelForXp('sorceror-from-another-game', 10 ** 9), 1);
});

test('experience maps back to the level it has earned, at the thresholds themselves', () => {
  for (const level of [2, 3, 7, 10, 11, 20]) {
    const needed = xpForLevel('warrior', level);
    assert.equal(levelForXp('warrior', needed), level, `exactly ${needed} xp should be level ${level}`);
    assert.equal(levelForXp('warrior', needed - 1), level - 1, `one short of ${needed}`);
  }
});

test('progress reports the level earned, the next threshold, and the distance to it', () => {
  const character = { ...characterOf('warrior'), xp: XP_COLUMNS.B + 10 };
  const p = progressOf(character);
  // The sheet still says 1 — the level is **owed**, which is `pendingLevels`'s own question.
  assert.equal(p.level, 1);
  assert.equal(p.earned, 2);
  assert.equal(p.into, 10, 'ten experience into the level the 900 has bought');
  assert.equal(p.next, xpForLevel('warrior', 3));
  assert.equal(p.needed, xpForLevel('warrior', 3) - character.xp);
  assert.ok(p.needed > 0);
  assert.equal(pendingLevels(character), 1);
});

test('nothing is due below the first threshold', () => {
  const character = { ...characterOf('mage'), xp: XP_COLUMNS.C - 1 };
  assert.equal(pendingLevels(character), 0);
  assert.equal(progressOf(character).needed, 1);
});

test('a level hands out 3 to 6 attribute points, and never more', () => {
  const seen = new Set();
  for (let roll = ATTRIBUTE_POINTS_MIN - 1; roll <= ATTRIBUTE_POINTS_MAX; roll++) {
    seen.add(rollAttributePoints(scripted(roll)));
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [3, 4, 5, 6]);
  assert.equal(ATTRIBUTE_POINTS_MIN, 3);
  assert.equal(ATTRIBUTE_POINTS_MAX, 6);
});

test('a level\'s health is a 1…hit-die roll plus the Endurance bonus in force before it', () => {
  const warrior = classById('warrior');          // d20
  assert.equal(rollHealthGain(warrior, 50, scripted(0)), 1 + 0 + 0);
  assert.equal(rollHealthGain(warrior, 50, scripted(19)), 20);
  // END 94 is the documented +5 endpoint; the bonus is read off the character's own sheet.
  assert.equal(rollHealthGain(warrior, 94, scripted(0)), 6);
  // …and it is the **pre-allocation** Endurance, so raising END shows up on the next level.
  const before = { ...characterOf('warrior'), attributes: [50, 50, 50, 50, 50, 50, 50, 50] };
  const taken = applyLevel({ character: before, points: 4, allocation: { endurance: 4 }, random: scripted(9) });
  assert.equal(taken.health, 10, 'a d20 roll of 9 + 1, and no Endurance bonus at END 50');
  assert.equal(taken.character.attributes[5], 54);
  assert.equal(taken.character.lastLevel.enduranceAfter, 1, 'END 54 is worth +1 on the *next* level');
  const next = applyLevel({ character: { ...taken.character, attributes: [50, 50, 50, 50, 50, 99, 50, 50] }, points: 1, allocation: { luck: 1 }, random: scripted(0) });
  assert.equal(next.health, 6, 'END 99 pays its +5 on the following level');
});

test('taking a level raises the attributes the player chose, and only those', () => {
  const before = characterOf('mage');
  const taken = applyLevel({ character: before, points: 5, allocation: { intelligence: 3, willpower: 2 }, random: scripted(2) });
  assert.equal(taken.character.level, 2);
  assert.deepEqual(taken.character.attributes, [50, 53, 52, 50, 50, 50, 50, 50]);
  assert.equal(taken.character.attributeMap.intelligence, 53);
  assert.equal(taken.character.attributeMap.luck, 50);
  assert.equal(taken.character.maxHealth, before.maxHealth + taken.health);
  assert.equal(taken.character.health, before.health + taken.health);
  // A mage's spell points are twice Intelligence, so three points of INT are six points of book.
  assert.equal(taken.character.maxSpellPoints, Math.round(2 * 53));
});

test('a fighting class gains no spell points and does not lose the ones it has', () => {
  const taken = applyLevel({ character: characterOf('warrior'), points: 3, allocation: { strength: 3 }, random: scripted(1) });
  assert.equal(taken.character.maxSpellPoints, null);
  assert.equal(taken.character.spellPoints, null);
});

test('an attribute stops at 100 — the original hangs here, this does not', () => {
  const nearlyFull = { ...characterOf('warrior'), attributes: [100, 50, 50, 50, 50, 50, 50, 99] };
  const taken = applyLevel({ character: nearlyFull, points: 5, allocation: { strength: 3, luck: 2 }, random: scripted(4) });
  assert.equal(taken.character.attributes[0], ATTRIBUTE_MAX, 'a full attribute stays at 100');
  assert.equal(taken.character.attributes[7], ATTRIBUTE_MAX, 'the last point lands on the attribute with room');
  assert.match(taken.refused ?? '', /maximum/, 'the refusal is reported rather than swallowed');
  assert.equal(taken.character.level, 2, 'and the level is still taken');
  // One of the two luck points had room (99…100) and none of the three strength points did.
  assert.deepEqual(taken.spent, { luck: 1 });
  assert.equal(taken.character.lastLevel.unspent, 4, 'the points it could not place are reported');
});

test('all eight attributes full is a level taken, not a hang', () => {
  const full = { ...characterOf('warrior'), attributes: new Array(8).fill(ATTRIBUTE_MAX) };
  const taken = applyLevel({ character: full, points: 6, allocation: Object.fromEntries(
    ['strength', 'intelligence', 'willpower', 'agility', 'speed', 'endurance', 'personality', 'luck'].map((k) => [k, 1]),
  ), random: scripted(3) });
  assert.equal(taken.character.level, 2);
  assert.deepEqual(taken.character.attributes, new Array(8).fill(ATTRIBUTE_MAX));
  assert.equal(taken.character.lastLevel.unspent, 6);
});

test('an allocation larger than the roll cannot mint points', () => {
  const taken = applyLevel({
    character: characterOf('mage'), points: 3, allocation: { intelligence: 10, willpower: 10 }, random: scripted(0),
  });
  const spent = Object.values(taken.spent).reduce((a, b) => a + b, 0);
  assert.equal(spent, 3, 'three points rolled, three points placed');
  assert.equal(taken.character.attributes[1], 53);
  assert.equal(taken.character.attributes[2], 50);
});

test('the same character taken twice comes out the same', () => {
  const before = { ...characterOf('mage'), xp: 2500 };
  const a = applyLevel({ character: before, points: 4, allocation: { intelligence: 4 } });
  const b = applyLevel({ character: before, points: 4, allocation: { intelligence: 4 } });
  assert.deepEqual(a.character, b.character);
  assert.equal(a.health, b.health);
});

test('an unknown class is refused rather than levelled with made-up numbers', () => {
  assert.throws(() => applyLevel({ character: { classId: 'nonesuch', attributes: [50, 50, 50, 50, 50, 50, 50, 50] }, points: 3 }), /unknown class/);
});
