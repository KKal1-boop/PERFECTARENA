// HUMAN ENEMIES (D-67): UESP's second bestiary section, held to the page.
//
// `Arena:Monsters`' **Human Enemies** text gives four things exactly — class and race, the
// level rule, the loot table and `25×(level−1)²` — and no hit points or damage. `game/humans.js`
// implements the four and marks the other two RECONSTRUCTED; this file holds both halves,
// including the join that matters most: **every id the loot drops is a real catalogue row**, so
// a human cannot kill a player and hand back a sword that does not exist.
//
// Run:  node --test tests/unit/humans.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOW_FAMILIES, CLASS_ARMOUR, CLASS_WEAPON, HUMAN_FAMILY, HUMAN_SPRITE, RARE_METALS, familyForClass,
  humanLevel, humanLoot, humanNote, humanSheets, humanShare, humanXp, isArcherClass, rollHuman,
} from '../../src/game/humans.js';
import { CLASSES, RACES } from '../../src/game/character.js';
import { itemById } from '../../src/game/items.js';
import { spawnEncounter } from '../../src/game/encounters.js';
import { ArenaRandom } from '../../src/game/arenaRandom.js';
import { monsterXp } from '../../src/game/combat.js';

test('every one of Arena\'s 18 classes and 8 races can be a human enemy', () => {
  assert.equal(CLASSES.length, 18, 'Arena:Classes lists eighteen');
  assert.equal(RACES.length, 8, 'Arena:Races lists eight');
  for (const cls of CLASSES) {
    assert.ok(CLASS_WEAPON[cls.id], `${cls.id} holds a weapon`);
    assert.ok(CLASS_ARMOUR[cls.id], `${cls.id} wears a grade`);
  }
  // …and the two tables are not accidentally empty of each other's ids.
  assert.equal(Object.keys(CLASS_WEAPON).length, 18);
  assert.equal(Object.keys(CLASS_ARMOUR).length, 18);
  // Every class weapon is a base the fight's own table knows (`combat.js`).
  for (const base of new Set(Object.values(CLASS_WEAPON))) {
    assert.ok(['fists', 'dagger', 'shortsword', 'short-bow', 'mace', 'broadsword'].includes(base), base);
  }
});

test('the experience rule is UESP\'s, exactly: 25 × (level − 1)²', () => {
  assert.equal(humanXp(1), 0, 'a first-level human is worth nothing');
  assert.equal(humanXp(2), 25);
  assert.equal(humanXp(5), 400);
  assert.equal(humanXp(10), 2025);
  assert.equal(humanXp(20), 25 * 361);
  assert.equal(humanXp(0), 0, 'and nothing goes negative');
});

test('a quest dungeon\'s humans are the player\'s level; a group is lower', () => {
  const random = new ArenaRandom(3);
  for (let i = 0; i < 50; i++) {
    assert.equal(humanLevel({ playerLevel: 9, questDungeon: true, random }), 9, 'the same level, exactly');
  }
  // A group is one below the solitary figure, and never below 1.
  for (let i = 0; i < 50; i++) {
    const solo = humanLevel({ playerLevel: 9, random });
    const group = humanLevel({ playerLevel: 9, group: true, random });
    assert.ok(group >= 1 && group <= 9);
    assert.ok(group <= solo + 1);
  }
  assert.equal(humanLevel({ playerLevel: 1, group: true }), 1, 'the floor is first level');
  // A solitary human elsewhere is the player's level with a one-level spread.
  const seen = new Set();
  const r = new ArenaRandom(11);
  for (let i = 0; i < 200; i++) seen.add(humanLevel({ playerLevel: 10, random: r }));
  assert.deepEqual([...seen].sort((a, b) => a - b), [9, 10, 11]);
});

test('a rolled human carries its class, race, statistics and UESP\'s experience', () => {
  const random = new ArenaRandom(21);
  const human = rollHuman({ level: 12, classId: 'battlemage', raceId: 'breton', random });
  assert.equal(human.name, 'Breton Battlemage');
  assert.equal(human.level, 12);
  assert.equal(human.sprite, HUMAN_SPRITE, 'the install\'s only human combat set');
  assert.equal(human.xpRate, 0);
  assert.equal(human.xpBase, humanXp(12));
  assert.equal(monsterXp(human), humanXp(12), 'the fight pays the source\'s number');
  assert.ok(human.maxHealth > 0 && human.health === human.maxHealth);
  assert.ok(human.damage[0] >= 1 && human.damage[1] >= human.damage[0], `${human.damage}`);
  assert.equal(human.human.classId, 'battlemage');
  assert.equal(human.human.raceId, 'breton');
  assert.match(human.human.ability, /spellmaker/, 'the class\'s own ability, from `character.js`');
  assert.match(human.human.racial, /half damage from magic/, 'and the race\'s');
  // The race's own attributes reach the record, so a blow at them has something to read.
  for (const key of ['strength', 'intelligence', 'willpower', 'agility', 'speed', 'endurance', 'personality', 'luck']) {
    assert.ok(Number.isFinite(human.attributes[key]), key);
  }
  assert.match(humanNote(human), /^Breton Battlemage, level 12/);
});

test('a fighter is tougher than a mage of the same level, and the roll spreads', () => {
  const warrior = rollHuman({ level: 10, classId: 'warrior', raceId: 'nord', random: new ArenaRandom(1) });
  const mage = rollHuman({ level: 10, classId: 'mage', raceId: 'breton', random: new ArenaRandom(1) });
  assert.ok(warrior.maxHealth > mage.maxHealth * 2, `${warrior.maxHealth} vs ${mage.maxHealth}`);
  assert.ok(warrior.damage[1] > mage.damage[1], 'and hits harder');
  const seen = new Set();
  const random = new ArenaRandom(5);
  for (let i = 0; i < 60; i++) seen.add(rollHuman({ level: 8, classId: 'knight', raceId: 'nord', random }).maxHealth);
  assert.ok(seen.size > 3, `the hit points vary (${seen.size} values)`);
  // …and a levelled human is worth far more than a first-level one.
  assert.ok(monsterXp(rollHuman({ level: 15 })) > monsterXp(rollHuman({ level: 3 })));
});

test('the loot is the page\'s table, and every piece of it is a real catalogue row', () => {
  const random = new ArenaRandom(31);
  const human = rollHuman({ level: 20, classId: 'warrior', raceId: 'nord', random });
  const loot = humanLoot(human, random);
  assert.ok(loot.gold >= 1 && loot.gold <= 50, `${loot.gold} gold`);
  // Every id resolves in `items.js` — a human cannot drop a sword the game cannot name.
  for (const id of loot.items) {
    const item = itemById(id);
    assert.ok(item, `${id} is in the catalogue`);
    assert.ok(item.name && item.kind, `${id} has a name and a kind`);
  }
  // A twentieth-level warrior has the whole set: four pieces, two pauldrons, a helm.
  const kinds = loot.items.map((id) => itemById(id).kind);
  assert.ok(kinds.filter((k) => k === 'armour').length >= 7, loot.items.join(', '));
  assert.ok(kinds.includes('weapon'), 'a weapon');
});

test('the pauldrons and the helm are level-gated at 6, 11 and 16, as printed', () => {
  const arms = (level) => {
    const random = new ArenaRandom(7);
    const loot = humanLoot(rollHuman({ level, classId: 'knight', raceId: 'nord', random }), random);
    return loot.items.filter((id) => /pauldron|helm/.test(id)).map((id) => id.replace(/^[a-z-]*?(?=pauldron|helm)/, ''));
  };
  assert.deepEqual(arms(6), [], 'nothing after level 6 means *not at* 6');
  assert.deepEqual(arms(7), ['pauldron-left']);
  assert.deepEqual(arms(11), ['pauldron-left'], 'and not the right one at 11');
  assert.deepEqual(arms(12), ['pauldron-left', 'pauldron-right']);
  assert.deepEqual(arms(16), ['pauldron-left', 'pauldron-right'], 'the helmet waits for 17');
  assert.deepEqual(arms(17), ['pauldron-left', 'pauldron-right', 'helm']);
});

test('the armour is the class\'s grade, with UESP\'s 10%-a-level chance of one better', () => {
  const gradeOf = (loot) => loot.items.find((id) => /cuirass/.test(id))?.split('-')[0];
  const chest = (level, classId, seed) => {
    const random = new ArenaRandom(seed);
    return gradeOf(humanLoot(rollHuman({ level, classId, random }), random));
  };
  // A level-1 mage wears leather; a level-1 warrior wears plate (his grade, not the upgrade).
  assert.equal(chest(1, 'mage', 3), 'leather');
  assert.equal(chest(1, 'warrior', 3), 'plate');
  // A level-1 rogue wears chain; at level 4 the 40% upgrade fires about two times in five,
  // so a sweep of seeds sees both grades.
  assert.equal(chest(1, 'thief', 3), 'chain');
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed++) seen.add(chest(4, 'thief', seed));
  assert.deepEqual([...seen].sort(), ['chain', 'plate'], 'a thief can wear the better grade by level 4');
  // …and at level 10 the chance is 100%, as "0+10%/level" reads, so *every* one is plate.
  for (let seed = 1; seed <= 20; seed++) assert.equal(chest(10, 'thief', seed), 'plate');
  // The mage's leather upgrades to chain, and at level 10 never leaves it.
  const mageSeen = new Set();
  for (let seed = 1; seed <= 60; seed++) mageSeen.add(chest(4, 'mage', seed));
  assert.deepEqual([...mageSeen].sort(), ['chain', 'leather']);
  assert.equal(chest(10, 'mage', 5), 'chain');
});

test('a rare weapon is UESP\'s 3%, and a shield comes only with a one-handed one', () => {
  const random = new ArenaRandom(43);
  let rare = 0;
  let trials = 0;
  for (let i = 0; i < 2000; i++) {
    const human = rollHuman({ level: 10, classId: 'warrior', raceId: 'nord', random });
    const loot = humanLoot(human, random);
    const weapon = loot.items.find((id) => itemById(id)?.kind === 'weapon');
    if (weapon && !weapon.startsWith('steel-')) rare++;
    trials++;
  }
  const rate = rare / trials;
  assert.ok(rate > 0.005 && rate < 0.08, `rare weapons ${(rate * 100).toFixed(1)}% of drops`);

  // "…a shield (if one-handed weapon was generated)": the pair is read off the corpse itself,
  // so both outcomes are exercised and neither is assumed.
  const twoHanded = new Set(['battle-axe', 'claymore', 'warhammer', 'dai-katana', 'long-bow', 'short-bow']);
  let withShield = 0;
  let without = 0;
  for (let i = 0; i < 200; i++) {
    const human = rollHuman({ level: 8, classId: 'thief', raceId: 'khajiit', random });
    const loot = humanLoot(human, random);
    const weapon = loot.items.find((id) => itemById(id)?.kind === 'weapon');
    const shield = loot.items.some((id) => itemById(id)?.kind === 'shield');
    const base = weapon?.replace(/^[a-z]+-/, '');
    if (shield) withShield++;
    else without++;
    assert.equal(shield, !twoHanded.has(base), `${weapon} → shield=${shield}`);
  }
  assert.ok(withShield > 20 && without > 5, `${withShield} shielded, ${without} two-handed`);
  assert.ok(RARE_METALS.length === 5, 'elven through ebony');
});

test('a dungeon really spawns them, at the player\'s level, through the scene\'s own path', () => {
  const cells = [];
  for (let i = 0; i < 40 * 40; i++) cells.push({ solid: false, floor: { texture: 1 } });
  const level = { width: 40, depth: 40, cells, cellSize: 1, floorY: 1 };
  const spawn = (seed, humans) => spawnEncounter({
    level, seed, danger: 6, count: 6, arrival: { row: 20, col: 20 }, minCells: 0,
    monsters: ['rat', 'goblin', 'wolf'], humans,
  });

  let humanCount = 0;
  const levels = new Set();
  for (let seed = 1; seed <= 120; seed++) {
    for (const foe of spawn(seed, { playerLevel: 8, questDungeon: true })) {
      if (foe.monster.kind !== 'human') continue;
      humanCount++;
      levels.add(foe.monster.level);
      assert.equal(foe.monster.level, 8, 'a quest dungeon\'s human is the player\'s level');
      assert.equal(foe.monster.name, `${foe.monster.human.raceName} ${foe.monster.human.className}`, foe.monster.name);
      assert.equal(foe.monster.xpBase, humanXp(8));
      assert.ok(foe.loot && foe.loot.gold >= 1 && foe.loot.gold <= 50, 'the corpse has a purse');
      assert.equal(foe.human, true);
    }
  }
  assert.ok(humanCount > 40, `${humanCount} humans out of 720 foes`);
  assert.deepEqual([...levels], [8]);

  // A caller that passes no `humans` gets the port's bestiary untouched.
  for (let seed = 1; seed <= 40; seed++) {
    for (const foe of spawn(seed, null)) assert.notEqual(foe.monster.kind, 'human');
  }
  // …and one that asks for them elsewhere gets the spread the page allows.
  const spread = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    for (const foe of spawn(seed, { playerLevel: 8 })) {
      if (foe.monster.kind === 'human') spread.add(foe.monster.level);
    }
  }
  for (const level_ of spread) assert.ok(level_ >= 1 && level_ <= 9, `${level_} is near the player`);
  assert.ok(spread.size > 1, 'a non-quest dungeon is not one fixed level');
});

test('the share is this project\'s, stated, and the country has none', () => {
  assert.equal(humanShare({ wilderness: true }), 0, 'no humans on the road');
  assert.equal(humanShare({ quest: true }), 0.5);
  assert.equal(humanShare({}), 0.34);
  assert.equal(humanShare({ dungeon: false }), 0);
});

// ── the archers, and the armour they wear (2026-10-22) ───────────────────────────
//
// The owner: *"human enemies need to have more variety in skins there needs to be archers with
// the actual archer skins that have a bow (there are actual sprites for that)"*. The archive's
// armoured roster is the variety — `UNA`, `LTR`, `CHN`, `PLT`, `BAR`, `MAG`, `MNK` — and its
// bow sheets are the archer art. These checks hold the table to the class table UESP prints.
test('a human\'s family follows their class\'s armour, and the sex prefixes the sheet', () => {
  assert.equal(familyForClass('archer'), 'CHN', 'the Archer wears chain (UESP\'s grade table)');
  assert.equal(familyForClass('ranger'), 'PLT');
  assert.equal(familyForClass('warrior'), 'PLT');
  assert.equal(familyForClass('thief'), 'CHN');
  assert.equal(familyForClass('mage'), 'MAG');
  assert.equal(familyForClass('barbarian'), 'BAR');
  assert.equal(familyForClass('monk'), 'MNK');
  assert.equal(familyForClass('bard'), 'LTR');
  assert.deepEqual(humanSheets({ classId: 'archer', sex: 'male' }), { body: HUMAN_SPRITE, bow: '01CHNBOW.CFA' });
  assert.deepEqual(humanSheets({ classId: 'ranger', sex: 'female' }), { body: HUMAN_SPRITE, bow: '11PLTBOW.CFA' });
  // A swordsman carries no bow, whatever family he wears.
  assert.equal(humanSheets({ classId: 'warrior', sex: 'male' }).bow, null);
  assert.equal(humanSheets(null).bow, null, 'no class, no bow');
  for (const family of BOW_FAMILIES) assert.ok(HUMAN_FAMILY[family.toLowerCase()], `${family} is a family`);
});

test('the archer classes are exactly the two UESP gives a bow', () => {
  assert.equal(isArcherClass('archer'), true);
  assert.equal(isArcherClass('ranger'), true);
  assert.equal(isArcherClass('warrior'), false);
  assert.equal(isArcherClass('bard'), false);
});

test('a rolled archer is a bowman in the world as well as in the numbers', () => {
  const archer = rollHuman({ classId: 'archer', level: 6, sex: 'male' });
  assert.equal(archer.bow, true);
  assert.equal(archer.bowFile, '01CHNBOW.CFA');
  assert.equal(archer.human.bow, true);
  assert.equal(archer.human.family, 'CHN');
  assert.equal(archer.human.sex, 'male');
  assert.equal(archer.human.weapon, 'short-bow', 'the class table\'s own weapon');
  const warrior = rollHuman({ classId: 'warrior', level: 6 });
  assert.equal(warrior.bow, false);
  assert.equal(warrior.bowFile, null);
  // The spread of classes the scene can meet really does produce both sexes and several
  // families, which is what "more variety in skins" means in practice.
  const sexes = new Set();
  const families = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const foe = rollHuman({ level: 4, random: new ArenaRandom(seed) });
    sexes.add(foe.human.sex);
    families.add(foe.human.family);
  }
  assert.equal(sexes.size, 2);
  assert.ok(families.size >= 3, `families met: ${[...families].join(', ')}`);
});
