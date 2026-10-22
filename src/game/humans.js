// HUMAN ENEMIES — UESP's second bestiary section, which this port did not field (D-67).
//
// `Arena:Monsters` has two sections. The first is the 24 entries `game/monsters.js` carries.
// The second is **Human Enemies**, and its whole text is (read 2026-10-17):
//
//   > Human enemies can be of any class or race and have the abilities given them by their
//   > race and class. They only appear as pale skinned humans, regardless in which province
//   > they are fought. Humans met in groups usually have a lower level than solitary ones.
//   > Humans met in quest dungeons such as Fortress of Ice have the same level as the player.
//   > Loot: {1 .. 50} gold, set of armor (cuirass, greaves, boots and gauntlets; 0+10%/level
//   > chance to have a chain/plate one for corresponding classes), left pauldron after
//   > level 6, right pauldron after level 11, helmet after level 16, random weapon (3%
//   > chance for a rare/magic weapon), a shield (if one-handed weapon was generated).
//   > Exp: 25*(level-1)²
//
// So the source gives **four** things exactly — the class/race rule, the level rule, the loot
// table and the experience rule — and gives **no hit-point or damage rule at all**. This module
// implements the four as written and marks the other two RECONSTRUCTED, because a foe with no
// hit points is not a foe:
//
//   * **The classes and the races are the game's own tables**, not copies: `character.js`'s
//     `CLASSES` (18, with each class's `hitDie`, spell points, critical chance and ability) and
//     `RACES` (8, with the starting attributes and the racial ability). A human enemy therefore
//     *is* what a player of that class and race is — which is what the page says it is.
//   * **Hit points** (RECONSTRUCTED): the class's `hitDie` × the level × a factor, with a small
//     spread. A warrior's 20/level against a mage's 6/level is the table the character sheet
//     already uses, so a level-10 Breton Battlemage is as frail as a level-10 player Battlemage
//     and a level-10 Nord Warrior is not.
//   * **Damage** (RECONSTRUCTED): the class's own weapon base (`combat.js`'s `WEAPONS`, the same
//     table the player swings) plus a level term, floored at 1.
//   * **Art**: the install ships exactly one human *combat* set — `GUARD01.CFA`…`GUARD06.CFA`,
//     five directions of walk with the attack frames inside, and a separate death sheet — in
//     the same six-file shape as a monster's art. That is the set a human enemy is drawn with.
//     The armoured crowd roster (`01CHN…`, `01PLT…`, `01MAG…`) has walk and attack frames but
//     **no death sheet**, so it cannot carry a fight. The class and race are therefore in the
//     name, the statistics, the abilities and the loot, and not in the silhouette — which is
//     also what the page says ("they only appear as pale skinned humans").
//
// Nothing here rolls a fight: `encounters.js` places the foe, `combat.js` swings with it, and
// the scene reads `human` off the rolled monster for the loot and the notice line.

import { CLASSES, RACES } from './character.js';

/**
 * The pale human combat set: `GUARD01.CFA`…`GUARD06.CFA`, the install's only human foe art.
 *
 * Five walk directions with the attack inside (12 frames each) and a sixth, three-frame death
 * sheet — the same shape as `monsters.js`'s `RAT`/`WOLF0` families, so the scene's existing
 * monster path draws it with no second code path.
 */
export const HUMAN_SPRITE = 'GUARD0';

/**
 * **The body a human foe is really drawn from.**
 *
 * The owner, 2026-10-22: *"human enemies need to have more variety in skins there needs to be
 * archers with the actual archer skins that have a bow (there are actual sprites for that)"*.
 *
 * The archive's **armoured roster** is exactly that art: five direction sheets per family —
 * `01CHNWLK.CFA` … `05CHNWLK.CFA` for chain, and `LTR`, `PLT`, `UNA`, `BAR`, `MAG`, `MNK` for
 * the rest — and a **bow sheet** per family (`01CHNBOW.CFA`, three frames of draw → aim →
 * loose). The `01`/`11` prefix is the figure's sex (male/female), which is why the family
 * alone is not enough to name a file.
 *
 * A human foe keeps `GUARD0` as their **body** (it is the one set with all five directions
 * *and* a death sheet, so the fight can turn and fall), and wears their family's bow sheet
 * for the shot. That is the honest use of the art: the archer the player meets is the archer
 * the install drew, without inventing a fifth-direction bow that does not exist.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const HUMAN_FAMILY = Object.freeze({
  una: 'UNA', ltr: 'LTR', chn: 'CHN', plt: 'PLT', bar: 'BAR', mag: 'MAG', mnk: 'MNK',
});

/** The families that ship a bow sheet (`*BOW.CFA`), by the archive's own listing. */
export const BOW_FAMILIES = Object.freeze(['UNA', 'LTR', 'CHN', 'PLT']);

/**
 * The family a class's humans walk in, from the armour grade the class wears.
 * @param {string} classId
 * @returns {string} one of `HUMAN_FAMILY`'s values
 */
export function familyForClass(classId) {
  if (classId === 'barbarian') return 'BAR';
  if (classId === 'monk') return 'MNK';
  if (['mage', 'battlemage', 'sorceror', 'healer', 'nightblade', 'spellsword'].includes(classId)) return 'MAG';
  const grade = CLASS_ARMOUR[classId] ?? 'leather';
  return grade === 'plate' ? 'PLT' : grade === 'chain' ? 'CHN' : 'LTR';
}

/**
 * Does this class fight with a bow? UESP's class table puts the **Archer** and the **Ranger**
 * there, and `CLASS_WEAPON` gives both a short bow — so a human of either class is an archer in
 * the world as well as in the numbers.
 * @param {string} classId
 * @returns {boolean}
 */
export function isArcherClass(classId) {
  return CLASS_WEAPON[classId] === 'short-bow';
}

/**
 * **The sheets a human foe wears**: the body every human shares, and the bow a bowman looses
 * with (null when the class does not carry one, or when this install has no such family).
 *
 * @param {{classId?: string, sex?: string}|null} human
 * @returns {{body: string, bow: string|null}}
 */
export function humanSheets(human) {
  const family = familyForClass(String(human?.classId ?? 'warrior'));
  const prefix = human?.sex === 'female' ? '11' : '01';
  const bow = isArcherClass(human?.classId) && BOW_FAMILIES.includes(family)
    ? `${prefix}${family}BOW.CFA`
    : null;
  return { body: HUMAN_SPRITE, bow };
}

/** A class row by id, or null. @param {string} id */
export function classOf(id) {
  const wanted = String(id ?? '').toLowerCase();
  return CLASSES.find((c) => c.id === wanted) ?? null;
}

/** A race row by id (`darkelf`, `highelf`, `woodelf`, …), or null. @param {string} id */
export function raceOf(id) {
  const wanted = String(id ?? '').toLowerCase();
  return RACES.find((r) => r.id === wanted) ?? null;
}

/**
 * The weapon base each class fights with — UESP's class table's own preference, and the same
 * grouping `items.js` uses for the weapon a *player* of the class begins with: the six warrior
 * classes carry a broadsword, the rogues' a shortsword and the mages' a dagger; the archer and
 * the ranger carry a bow, and the monk's hands are his weapons.
 *
 * RECONSTRUCTED in the sense that UESP prints the class table and not "what a human enemy of
 * that class holds"; the mapping is the starting weapon the game already hands a player of the
 * class (`items.js`'s `STARTING_WEAPON_OF_CLASS`), which is the closest thing the source has.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const CLASS_WEAPON = Object.freeze({
  acrobat: 'shortsword', archer: 'short-bow', assassin: 'shortsword', barbarian: 'broadsword',
  bard: 'shortsword', battlemage: 'dagger', burglar: 'shortsword', healer: 'dagger',
  knight: 'broadsword', mage: 'dagger', monk: 'fists', nightblade: 'dagger', ranger: 'short-bow',
  rogue: 'shortsword', sorceror: 'dagger', spellsword: 'dagger', thief: 'shortsword', warrior: 'broadsword',
});

/**
 * Which armour grade a class's humans wear — UESP's "for corresponding classes".
 *
 * The three grades are the catalogue's own (`items.js`): `plate` for the fighters, `chain` for
 * the rogues and the monks, `leather` for the mages and the healer. A class UESP does not name
 * in this rule (there is no table, only the phrase) gets leather, the grade everyone can wear.
 *
 * @type {Readonly<Record<string, 'plate' | 'chain' | 'leather'>>}
 */
export const CLASS_ARMOUR = Object.freeze({
  archer: 'chain', barbarian: 'plate', knight: 'plate', ranger: 'plate', warrior: 'plate',
  acrobat: 'leather', assassin: 'leather', bard: 'leather', burglar: 'chain', monk: 'leather',
  rogue: 'chain', thief: 'chain',
  battlemage: 'leather', healer: 'leather', mage: 'leather', nightblade: 'leather',
  sorceror: 'leather', spellsword: 'leather',
});

/** The piece ids each grade's armour is bought in, in the catalogue's spelling. */
const GRADES = Object.freeze({
  leather: (piece) => `leather-${piece}`,
  chain: (piece) => `chain-${piece}`,
  plate: (piece) => `plate-${piece}`,
});

/**
 * What a human's armour grade is worth against the player's blow — UESP's own grade numbers
 * (`armour.js`: leather 3, chain 6, plate 9), read as one guard rather than per body area.
 *
 * RECONSTRUCTED as a *flat* reduction: the page's rating is per area, and a human carries a
 * grade, not seven worn pieces. `combat.js`'s `resolveAttack` subtracts it, floored at 1.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const GRADE_GUARD = Object.freeze({ leather: 3, chain: 6, plate: 9 });

/** The rarest metals a "rare/magic weapon" is made of (UESP: 3%). */
export const RARE_METALS = Object.freeze(['elven', 'dwarven', 'mithril', 'adamantium', 'ebony']);

/**
 * UESP's experience rule for a human enemy, exactly: `25 × (level − 1)²`.
 *
 * Expressed in `monsters.js`'s own shape as `xpRate: 0, xpBase: humanXp(level)`, so the scene's
 * existing award (`monsterXp`) prints and pays the source's number without a second formula.
 *
 * @param {number} level
 * @returns {number}
 */
export function humanXp(level) {
  const n = Math.max(1, Math.trunc(Number(level) || 1));
  return 25 * (n - 1) * (n - 1);
}

/**
 * The level a human enemy is met at — UESP's three rules and nothing else.
 *
 *   * a **quest dungeon** (Fortress of Ice, the palace's depths): the player's own level, exactly;
 *   * a **group**: "usually a lower level than solitary ones", so one below the solitary figure;
 *   * anywhere else: the player's level, with a one-level spread either way (RECONSTRUCTED: the
 *     page says only that groups are lower, so a solo human outside a quest is "about" the
 *     player and the spread is this project's).
 *
 * @param {{playerLevel?: number, group?: boolean, questDungeon?: boolean, random?: object}} opts
 * @returns {number} at least 1
 */
export function humanLevel(opts = {}) {
  const player = Math.max(1, Math.trunc(Number(opts.playerLevel) || 1));
  let level;
  if (opts.questDungeon) level = player;
  else {
    const spread = opts.random ? opts.random.nextBelow(3) - 1 : 0;
    level = player + spread;
    if (opts.group) level -= 1;
  }
  return Math.max(1, level);
}

/**
 * Roll one human enemy: the class and race UESP says any human may be, the statistics the
 * player's own class and race tables imply, and the experience the page gives exactly.
 *
 * @param {object} [opts]
 * @param {number} [opts.level]        the level to roll at (default 1)
 * @param {string} [opts.classId]      a `character.js` class id; random when absent
 * @param {string} [opts.raceId]       a `character.js` race id; random when absent
 * @param {object} [opts.random]       an `ArenaRandom` (or any `nextBelow`)
 * @param {boolean} [opts.group]       met in a group (kept on the record for the loot line)
 * @param {boolean} [opts.questDungeon]
 * @returns {object} a monster-shaped record (`combat.js` and `encounters.js` both read it)
 */
export function rollHuman(opts = {}) {
  const random = opts.random ?? { nextBelow: (n) => Math.floor(Math.random() * n) };
  const cls = classOf(opts.classId) ?? CLASSES[random.nextBelow(CLASSES.length)];
  const race = raceOf(opts.raceId) ?? RACES[random.nextBelow(RACES.length)];
  const level = Math.max(1, Math.trunc(Number(opts.level) || 1));
  const bases = race.bases.male;
  const attributes = {
    strength: bases[0], intelligence: bases[1], willpower: bases[2], agility: bases[3],
    speed: bases[4], endurance: bases[5], personality: bases[6], luck: bases[7],
  };
  // RECONSTRUCTED: hit points from the class's own hit die. The factor keeps a level-1 foe
  // killable with a starting weapon and a level-20 one worth its 9 000 experience.
  const base = Math.max(4, Math.round(cls.hitDie * level * 0.65));
  const spread = Math.max(1, Math.round(base * 0.15));
  const maxHealth = Math.max(1, base + (random.nextBelow(spread * 2 + 1) - spread));
  // RECONSTRUCTED: damage from the class's own weapon base plus a level term. The player's
  // weapon table is the only published damage ladder this data set has.
  const weapon = weaponBase(cls.id);
  const damage = [
    Math.max(1, weapon.min + Math.floor(level / 4)),
    Math.max(1, weapon.max + Math.floor(level / 2)),
  ];
  const sex = opts.sex === 'female' || opts.sex === 'male'
    ? opts.sex
    : (random.nextBelow(2) === 0 ? 'female' : 'male');
  const sheets = humanSheets({ classId: cls.id, sex });
  return {
    id: `human-${cls.id}`,
    name: `${race.name} ${cls.name}`,
    sprite: HUMAN_SPRITE,
    kind: 'human',
    // **The skin and the shot.** `bow` makes the scene's fight treat this foe as a bowman
    // (it keeps its distance and looses), and `bowFile` is the install's own sheet for the
    // family the class wears (`<=01|11><LTR|CHN|PLT|UNA>BOW.CFA`).
    bow: Boolean(sheets.bow),
    bowFile: sheets.bow,
    family: familyForClass(cls.id),
    sex,
    level,
    health: maxHealth,
    maxHealth,
    damage,
    // UESP's human rule, in `monsters.js`'s two fields: no rate, and every point of the
    // experience is the level's.
    xpRate: 0,
    xpBase: humanXp(level),
    damageMin: damage[0],
    damageMax: damage[1],
    attributes,
    armourFlat: GRADE_GUARD[CLASS_ARMOUR[cls.id]] ?? 3,
    // The cadence is the caller's: `encounters.js` and the scene set it from `combat.js`'s
    // own `attackInterval`, so a human swings at the same rate a creature of its level does.
    nextAttack: 0,
    human: {
      classId: cls.id,
      className: cls.name,
      raceId: race.id,
      raceName: race.name,
      ability: cls.ability,
      racial: race.ability,
      weapon: weapon.id,
      weaponName: weapon.name,
      sex,
      family: familyForClass(cls.id),
      bow: Boolean(sheets.bow),
      bowFile: sheets.bow,
    },
  };
}

/**
 * The class's weapon base from `combat.js`'s table, without importing it at module load (the
 * catalogue imports the fight, so a top-level import here would close a cycle through
 * `encounters.js`). Kept local, with the ranges UESP prints for those bases.
 *
 * @param {string} classId
 * @returns {{id: string, name: string, min: number, max: number}}
 */
function weaponBase(classId) {
  const id = CLASS_WEAPON[classId] ?? 'shortsword';
  const row = WEAPON_BASES[id] ?? WEAPON_BASES.shortsword;
  return { id, ...row };
}

/** The base rows a human can hold, from UESP's weapon reference (see `combat.js`). */
const WEAPON_BASES = Object.freeze({
  fists: { name: 'Fists', min: 1, max: 2 },
  dagger: { name: 'Dagger', min: 1, max: 6 },
  shortsword: { name: 'Shortsword', min: 1, max: 8 },
  'short-bow': { name: 'Short Bow', min: 2, max: 8 },
  mace: { name: 'Mace', min: 1, max: 12 },
  broadsword: { name: 'Broadsword', min: 1, max: 12 },
  longsword: { name: 'Longsword', min: 2, max: 16 },
  'war-axe': { name: 'War Axe', min: 2, max: 12 },
  'battle-axe': { name: 'Battle Axe', min: 2, max: 16 },
});

/**
 * The weapons a human corpse may hold — UESP says only "random weapon", so the pool is the
 * base weapons a person carries, and the *class* does not narrow it (a mage's corpse can hold
 * a war axe; the page never ties the two).
 *
 * @type {ReadonlyArray<string>}
 */
export const LOOT_WEAPONS = Object.freeze([
  'dagger', 'shortsword', 'broadsword', 'longsword', 'mace', 'war-axe', 'short-bow', 'battle-axe',
]);

/** The two-handed bases (`items.js`'s `TWO_HANDED`), which take no shield — "a shield (if a
 * one-handed weapon was generated)". Written out so this module stays free of the catalogue. */
const TWO_HANDED_BASES = new Set(['battle-axe', 'claymore', 'warhammer', 'dai-katana', 'long-bow', 'short-bow']);

/**
 * What a dead human carried — UESP's loot line, in the catalogue's own item ids.
 *
 * The page is precise and this follows it piece by piece:
 *
 *   * **gold**: `1…50`;
 *   * **a set of armour**: cuirass, greaves, boots and gauntlets always, in the class's grade,
 *     with UESP's **`10% × level`** chance of the next grade up for the classes it names
 *     ("a chain/plate one for corresponding classes");
 *   * **the pauldrons and the helm are level-gated**: left pauldron after 6, right after 11,
 *     helmet after 16 — so a level-6 human has no pauldron and a level-17 one may have all
 *     seven pieces;
 *   * **a weapon**: 3% chance of a rare/magic one (a metal from `RARE_METALS`), else steel;
 *   * **a shield** when that weapon is one-handed.
 *
 * Note what the page does *not* say and this therefore does not do: it never drops a shield for
 * a two-handed weapon, and it never drops a rare piece of armour.
 *
 * @param {object} human  a `rollHuman` record
 * @param {object} [random]
 * @returns {{gold: number, items: string[]}} ids a caller can add to a bag or a corpse
 */
export function humanLoot(human, random = { nextBelow: (n) => Math.floor(Math.random() * n) }) {
  const level = Math.max(1, Math.trunc(human?.level ?? 1));
  const classId = human?.human?.classId ?? 'warrior';
  const grade = CLASS_ARMOUR[classId] ?? 'leather';
  const gold = 1 + random.nextBelow(50);
  const items = [];

  // The four pieces every human wears.
  for (const piece of ['cuirass', 'greaves', 'boots', 'gauntlet']) items.push(GRADES[grade](piece));
  // UESP's 10% per level of one grade better, for the classes the line names. Capped at plate.
  const upgrade = Math.min(100, 10 * level);
  if (grade !== 'plate' && random.nextBelow(100) < upgrade) {
    const better = grade === 'leather' ? 'chain' : 'plate';
    items.splice(0, 4, ...['cuirass', 'greaves', 'boots', 'gauntlet'].map((piece) => GRADES[better](piece)));
  }
  // The level gates, exactly as printed: "after level 6", "after level 11", "after level 16".
  if (level > 6) items.push(GRADES[grade]('pauldron-left'));
  if (level > 11) items.push(GRADES[grade]('pauldron-right'));
  if (level > 16) items.push(GRADES[grade]('helm'));

  // The weapon: UESP says **"random weapon (3% chance for a rare/magic weapon)"** — random,
  // not the class's own — so the pool is the base weapons a person carries and the metal is
  // steel unless the 3% fires.
  const base = LOOT_WEAPONS[random.nextBelow(LOOT_WEAPONS.length)];
  const metal = random.nextBelow(100) < 3 ? RARE_METALS[random.nextBelow(RARE_METALS.length)] : 'steel';
  items.push(`${metal}-${base}`);
  // "…a shield (if one-handed weapon was generated)".
  if (!TWO_HANDED_BASES.has(base)) {
    const shield = ['buckler', 'round-shield', 'kite-shield', 'tower-shield'][random.nextBelow(4)];
    items.push(shield);
  }
  return { gold, items };
}

/**
 * The one-line description a notice or a probe prints.
 *
 * @param {object} human  a `rollHuman` record
 * @returns {string} e.g. `Breton Battlemage, level 5 (spellmaker discounts on some effects)`
 */
export function humanNote(human) {
  if (!human?.human) return '';
  const { raceName, className, weaponName } = human.human;
  return `${raceName} ${className}, level ${human.level} with a ${weaponName.toLowerCase()}`;
}

/**
 * How many of the foes a place fields are human, by the kind of place (RECONSTRUCTED).
 *
 * UESP gives no frequency. This project's rule: **a dungeon fields a third of its foes as
 * humans** — the page's own "humans met in quest dungeons" — and the country fields none, since
 * "they only appear as pale skinned humans" in the places a person goes. A caller may pass its
 * own share; `0` reproduces the port's behaviour before this module.
 *
 * @param {{quest?: boolean, wilderness?: boolean, dungeon?: boolean}} place
 * @returns {number} 0…1
 */
export function humanShare(place = {}) {
  if (place.wilderness) return 0;
  if (place.quest) return 0.5;
  return place.dungeon === false ? 0 : 0.34;
}
