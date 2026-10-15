// COMBAT — ARENA'S INGREDIENTS, AND ONE HONEST RECONSTRUCTION.
//
// What the sources actually say, and where each number here comes from:
//
//   **Weapon damage.** UESP's weapon reference gives each weapon base a damage *range*
//     (Fists 1–2, Daggers 1–6, Broadswords 1–10, Maces 1–12, Longswords 2–16,
//     Claymores 2–18, Dai-Katanas 3–21, …). `WEAPONS` is that table, transcribed.
//   **Weapon material.** The same reference: iron is "−1 to hit and damage", steel and
//     silver are 0, and elven, dwarven, mithril, adamantium and ebony go +1…+5. `MATERIALS`
//     is that table.
//   **Agility and armour class.** UESP, *Attributes*: "Every 5 points in agility grants
//     -1 to AC across your whole body", and Agility also "affects your chances of hitting
//     an enemy with a melee weapon". `armourClass()` is that rule, exactly.
//   **Strength.** UESP: Strength "affects how much damage you do in melee combat", with
//     modifiers rising by one per five points over an average of 48–50 and reaching +10.
//     `strengthBonus()` is that shape.
//   **Monster damage and hit points.** UESP's bestiary (`game/monsters.js`).
//
// What **no** readable source gives, and what is therefore marked RECONSTRUCTED below:
//
//   * the exact to-hit roll. OpenTESArena's release notes say only that it "Implemented
//     original combat hit chance calculation based on level", which establishes that
//     level is an input and nothing more. UESP's monster table has no per-monster armour
//     class or to-hit value at all, and its combat page says only that Agility and Luck
//     affect whether blows land.
//   * how often a monster attacks. UESP gives damage per blow and no cadence.
//   * the directional attack bonuses printed in the manual, which a UESP talk-page
//     investigation could not reproduce in the game and suspects were never implemented.
//     They are **not** here.
//
// `HIT_FORMULA_NOTE` is the sentence the game itself prints about this, so the player is
// told which numbers are Arena's and which are this project's. Logged as S27 in
// PROGRESS.md.

import { ArenaRandom } from './arenaRandom.js';

/**
 * One attribute, from either of the two shapes a character is carried in.
 *
 * `createCharacter` lays the eight attributes out *by key* (`attributeMap`) and keeps the
 * rolled array as well, so a caller may hand either: an actor with `attributes.strength`,
 * or one with `attributes[0]`. Reading only one of them silently fell back to the average
 * for every real character, which is exactly the kind of bug a test cannot see unless it
 * asks for a number it can predict.
 *
 * @param {object|undefined} actor
 * @param {string} key
 * @param {number} index
 * @param {number} fallback
 * @returns {number}
 */
export function attributeOf(actor, key, index, fallback = 50) {
  const bag = actor?.attributes;
  if (Array.isArray(bag)) {
    const value = bag[index];
    return Number.isFinite(value) ? value : fallback;
  }
  const direct = bag?.[key] ?? actor?.[key];
  return Number.isFinite(direct) ? direct : fallback;
}

/**
 * Weapon bases and their damage ranges, from UESP's weapon reference.
 * @type {ReadonlyArray<{id: string, name: string, min: number, max: number}>}
 */
export const WEAPONS = Object.freeze([
  { id: 'fists', name: 'Fists', min: 1, max: 2 },
  { id: 'chain-gauntlets', name: 'Chain Gauntlets', min: 2, max: 3 },
  { id: 'plate-gauntlets', name: 'Plate Gauntlets', min: 3, max: 4 },
  { id: 'dagger', name: 'Dagger', min: 1, max: 6 },
  { id: 'tanto', name: 'Tanto', min: 1, max: 8 },
  { id: 'shortsword', name: 'Shortsword', min: 1, max: 8 },
  { id: 'staff', name: 'Staff', min: 1, max: 8 },
  { id: 'short-bow', name: 'Short Bow', min: 2, max: 8 },
  { id: 'wakizashi', name: 'Wakizashi', min: 1, max: 10 },
  { id: 'broadsword', name: 'Broadsword', min: 1, max: 10 },
  { id: 'mace', name: 'Mace', min: 1, max: 12 },
  { id: 'long-bow', name: 'Long Bow', min: 1, max: 12 },
  { id: 'war-axe', name: 'War Axe', min: 2, max: 12 },
  { id: 'saber', name: 'Saber', min: 3, max: 12 },
  { id: 'flail', name: 'Flail', min: 2, max: 14 },
  { id: 'longsword', name: 'Longsword', min: 2, max: 16 },
  { id: 'battle-axe', name: 'Battle Axe', min: 2, max: 16 },
  { id: 'katana', name: 'Katana', min: 3, max: 16 },
  { id: 'claymore', name: 'Claymore', min: 2, max: 18 },
  { id: 'warhammer', name: 'Warhammer', min: 3, max: 18 },
  { id: 'dai-katana', name: 'Dai-Katana', min: 3, max: 21 },
]);

/**
 * Weapon materials: their to-hit and damage modifiers, from UESP's/Fandom's table.
 * @type {ReadonlyArray<{id: string, name: string, hit: number, damage: number}>}
 */
export const MATERIALS = Object.freeze([
  { id: 'iron', name: 'Iron', hit: -1, damage: -1 },
  { id: 'steel', name: 'Steel', hit: 0, damage: 0 },
  { id: 'silver', name: 'Silver', hit: 0, damage: 0 },
  { id: 'elven', name: 'Elven', hit: 1, damage: 1 },
  { id: 'dwarven', name: 'Dwarven', hit: 2, damage: 2 },
  { id: 'mithril', name: 'Mithril', hit: 3, damage: 3 },
  { id: 'adamantium', name: 'Adamantium', hit: 4, damage: 4 },
  { id: 'ebony', name: 'Ebony', hit: 5, damage: 5 },
]);

/** The sentence the game prints about its own combat numbers. See this file's header. */
export const HIT_FORMULA_NOTE = 'Arena\'s own weapon damage, materials and Agility-to-AC rule; '
  + 'the to-hit chance here is this project\'s reconstruction, because the original lives in A.EXE.';

/** @param {string} id */
export const weaponById = (id) => WEAPONS.find((w) => w.id === String(id).toLowerCase()) ?? WEAPONS[0];
/** @param {string} id */
export const materialById = (id) => MATERIALS.find((m) => m.id === String(id).toLowerCase()) ?? MATERIALS[1];

/**
 * UESP: every five points of Agility is one point of armour class, and lower AC is
 * better — so this returns the *subtraction* from a to-hit chance.
 *
 * @param {number} agility
 * @returns {number} 0 or more
 */
export function armourClass(agility) {
  return Math.max(0, Math.floor((Number(agility) || 0) / 5));
}

/**
 * UESP's Strength shape: one point of damage per five points over an average of 48–50,
 * capped at +10. The same rule read downwards gives a penalty below 50, and a blow always
 * does at least one point — a hit that does nothing reads as a miss.
 *
 * @param {number} strength
 * @returns {number} −10…+10
 */
export function strengthBonus(strength) {
  const value = Number(strength) || 0;
  return Math.max(-10, Math.min(10, Math.floor((value - 50) / 5)));
}

/**
 * The chance a blow lands, in percent. **RECONSTRUCTED** — see this file's header.
 *
 * The shape is deliberately the one the sources describe and no more: a base chance, the
 * attacker's level against the defender's, the defender's Agility as armour class, the
 * attacker's Luck, and the weapon material's own to-hit modifier.
 *
 * @param {object} attacker  `{level, attributes?, luck?, material?}`
 * @param {object} defender  `{level, agility?}`
 * @param {{hit?: number}} [mods]
 * @returns {number} 5…95, so neither side is ever untouchable
 */
export function hitChance(attacker, defender, mods = {}) {
  const base = 55;
  const levelSwing = 4 * ((attacker?.level ?? 1) - (defender?.level ?? 1));
  const agility = armourClass(attributeOf(defender, 'agility', 3, 0));
  const luck = attributeOf(attacker, 'luck', 7, 50);
  const luckTerm = Math.floor((luck - 50) / 10);
  const material = mods.hit ?? 0;
  return Math.max(5, Math.min(95, base + levelSwing - agility + luckTerm + material));
}

/**
 * Resolve one blow.
 *
 * @param {object} opts
 * @param {object} opts.attacker  a character or a monster; `attributes` optional
 * @param {object} opts.defender
 * @param {string} [opts.weapon]    weapon base id, default fists
 * @param {string} [opts.material]  material id, default steel
 * @param {ArenaRandom} [opts.random]
 * @param {boolean} [opts.guaranteedHit] a timed, in-reach riposte bypasses only the hit roll
 * @returns {{hit: boolean, chance: number, roll: number, damage: number, raw: number, critical: boolean}}
 */
export function resolveAttack(opts) {
  const random = opts.random ?? new ArenaRandom(1);
  const weapon = weaponById(opts.weapon ?? 'fists');
  const material = materialById(opts.material ?? 'steel');
  const chance = hitChance(opts.attacker, opts.defender, { hit: material.hit });
  const roll = 1 + random.nextBelow(100);
  const hit = Boolean(opts.guaranteedHit) || roll <= chance;
  // Damage: the weapon's own range, the material's modifier, then Strength.
  const strength = attributeOf(opts.attacker, 'strength', 0, 50);
  const span = Math.max(0, weapon.max - weapon.min);
  const roll2 = weapon.min + (span ? random.nextBelow(span + 1) : 0);
  const raw = roll2 + material.damage + strengthBonus(strength);
  // Arena's classes carry a critical chance per level (`character.js`): a critical blow
  // is doubled. The doubling is this project's reading of "critical strike"; the chance
  // per level is UESP's.
  const criticalChance = (opts.attacker?.critical ?? 0) * Math.max(1, opts.attacker?.level ?? 1);
  const critical = hit && criticalChance > 0 && (1 + random.nextBelow(100)) <= criticalChance;
  // **A backstab has weight** (the browsergame's own reading, carried here): a blow from
  // behind lands half again as hard — `opts.fromBehind` is the *position*, which the caller
  // computes from the defender's own facing, not a roll.
  const backstab = hit && Boolean(opts.fromBehind);
  const damage = hit ? Math.max(1, Math.ceil(raw * (critical ? 2 : 1) * (backstab ? 1.5 : 1))) : 0;
  return { hit, chance, roll, damage, raw, critical, backstab };
}

/**
 * A monster's blow: its damage range from UESP, and its own level against the player's.
 *
 * UESP gives no attack cadence, so `attackInterval()` returns this project's own figure
 * and says so; the *damage* of each blow is Arena's.
 *
 * @param {object} opts
 * @param {object} opts.monster   a rolled monster (`rollMonster` below)
 * @param {object} opts.target    the player character
 * @param {ArenaRandom} [opts.random]
 */
export function monsterAttack(opts) {
  const random = opts.random ?? new ArenaRandom(1);
  const monster = opts.monster;
  const target = opts.target;
  const chance = hitChance({ level: monster.level, attributes: { luck: 50 } }, { level: target?.level ?? 1, attributes: target?.attributes });
  const roll = 1 + random.nextBelow(100);
  const hit = roll <= chance;
  const [min, max] = monster.damage;
  const span = Math.max(0, max - min);
  const damage = hit ? min + (span ? random.nextBelow(span + 1) : 0) : 0;
  return { hit, chance, roll, damage };
}

/**
 * RECONSTRUCTED: how long a monster waits between blows. UESP gives damage per blow and
 * no rate; Arena's combat is generally described as fast, so a heavier creature swings
 * more slowly. Replaceable in one place when a source turns up.
 *
 * @param {object} monster
 * @returns {number} seconds
 */
export function attackInterval(monster) {
  return 1.1 + Math.min(1.4, (monster.level ?? 1) * 0.05);
}

/**
 * Roll one monster of a kind: hit points and damage drawn from its UESP ranges.
 *
 * @param {object} kind  a `MONSTERS` entry
 * @param {ArenaRandom} [random]
 * @param {{level?: number}} [opts]
 * @returns {object} a monster instance
 */
export function rollMonster(kind, random = new ArenaRandom(1), opts = {}) {
  const [hpMin, hpMax] = kind.hp;
  const hpSpan = Math.max(0, hpMax - hpMin);
  const maxHealth = hpMin + (hpSpan ? random.nextBelow(hpSpan + 1) : 0);
  return {
    id: kind.id,
    name: kind.name,
    sprite: kind.sprite,
    level: opts.level ?? kind.level,
    health: maxHealth,
    maxHealth,
    damage: kind.damage.slice(),
    xpRate: kind.xpRate,
    xpBase: kind.xpBase,
    damageMin: kind.damage[0],
    damageMax: kind.damage[1],
    nextAttack: attackInterval(kind) * (0.5 + random.nextBelow(100) / 100),
  };
}

/**
 * UESP's experience rule for a defeated monster.
 * @param {object} monster
 * @returns {number}
 */
export function monsterXp(monster) {
  // The *rolled* hit points, not whatever is left of them: UESP's rule values the
  // creature, and a monster killed in one blow is worth the same as one worn down.
  const hitPoints = monster.maxHealth ?? monster.health;
  return Math.max(0, Math.round(hitPoints * monster.xpRate + monster.xpBase));
}
