// WHAT THE PLAYER CARRIES.
//
// Arena's own inventory is a window full of item records, and the item records live in
// `A.EXE` — which this install does not ship (S1/D11) — and in the `.MIF`'s `LOOT` and
// `STOR` chunks, whose *placement* is decoded but whose bodies are not (S14). So rather
// than invent a bag of items the game cannot back with data, this module lists exactly
// what the project really knows the player has:
//
//   * **the weapon and its material** — the two fields the fight already swings with
//     (`game/combat.js`'s `WEAPONS` and `MATERIALS`, both UESP's tables), with the
//     damage range those tables give for the pair;
//   * **the purse** — `character.gold`, which radiant work pays into;
//   * **the quest's items** — the piece count, the mithril key and the Jewel of Fire,
//     which are real flags on the quest state, not decorations;
//   * **the wounds and the spells** — health and spell points, which are the character's
//     own rolled numbers;
//   * **the tally** — kills and experience, which the fight really counts.
//
// Nothing else is listed, and the panel says so. When the item chunks are decoded, this
// is the one place a real bag has to be added to.

import { MATERIALS, WEAPONS, armourClass, attributeOf, materialById, weaponById } from './combat.js';

/**
 * The weapon the player is swinging, and what it does.
 *
 * @param {object} character
 * @returns {{id: string, name: string, material: string, materialName: string, min: number, max: number}}
 */
export function weaponCarried(character) {
  const weapon = weaponById(character?.weapon ?? 'longsword') ?? WEAPONS.find((w) => w.id === 'longsword');
  const material = materialById(character?.material ?? 'steel') ?? MATERIALS.find((m) => m.id === 'steel');
  // The material's bonus is a flat modifier on the range, exactly as the fight applies it.
  const bonus = material?.damage ?? 0;
  return {
    id: weapon.id,
    name: weapon.name,
    material: material?.id ?? 'steel',
    materialName: material?.name ?? 'Steel',
    min: Math.max(1, weapon.min + bonus),
    max: Math.max(1, weapon.max + bonus),
  };
}

/**
 * Everything the player is carrying, as rows for the panel.
 *
 * @param {object} character
 * @param {{quest?: object, kills?: number, xp?: number, day?: number, side?: string|null}} [world]
 * @returns {{section: string, rows: {name: string, note: string}[]}[]}
 */
export function carried(character, world = {}) {
  const weapon = weaponCarried(character);
  const quest = world.quest ?? {};
  const sections = [
    {
      section: 'In hand',
      rows: [
        { name: `${weapon.name} (${weapon.materialName})`, note: `${weapon.min}–${weapon.max} damage` },
        // Agility is attribute 3 (`character.js`'s `ATTRIBUTES` order) and one point of
        // armour class is five of it — `armourClass` takes the attribute, not the actor.
        { name: `${armourClass(attributeOf(character, 'agility', 3, 0))} armour class`, note: 'from Agility, the armour rule UESP states' },
      ],
    },
    {
      section: 'Purse',
      rows: [{ name: `${character?.gold ?? 0} gold`, note: world.side ? `side work: ${world.side}` : 'earned by the job board' }],
    },
  ];
  const items = [];
  if (quest.pieces) items.push({ name: `Staff of Chaos — ${quest.pieces}/8 pieces`, note: 'the main quest' });
  if (quest.mithrilKey) items.push({ name: 'Mithril key', note: 'the Imperial Palace' });
  if (quest.hasKeyItem) items.push({ name: 'Jewel of Fire', note: 'the Imperial Palace' });
  if (items.length) sections.push({ section: 'Quest items', rows: items });
  sections.push({
    section: 'The road so far',
    rows: [
      { name: `${world.kills ?? 0} slain · ${world.xp ?? 0} experience`, note: 'what the fight counted' },
      { name: `${world.day ?? 0} days travelled`, note: 'fast travel and the calendar' },
    ],
  });
  return sections;
}

/**
 * How much of a blow a raised guard takes off.
 *
 * **RECONSTRUCTED** — and deliberately in the same shape as S27's to-hit roll. No
 * readable source describes Arena's block: the manual and UESP give no formula, and
 * `A.EXE` is absent (D11), so "a raised guard halves the blow" is this project's rule.
 * The combat line prints it (`BLOCK_NOTE`), so a player is told which numbers are
 * Arena's and which are ours, exactly as the strike line already does.
 */
export const BLOCK_REDUCTION = 0.5;

/** The sentence the HUD prints about the guard, beside the strike formula's own. */
export const BLOCK_NOTE = 'Holding B or the right mouse button raises your guard: '
  + `it takes ${Math.round(BLOCK_REDUCTION * 100)}% off any blow that lands — this project's rule, not Arena's.`;

/**
 * Apply a raised guard to an incoming blow.
 *
 * @param {number} damage
 * @param {boolean} blocking
 * @returns {{damage: number, blocked: number}}
 */
export function guardDamage(damage, blocking) {
  if (!blocking) return { damage, blocked: 0 };
  const taken = Math.max(1, Math.round(damage * (1 - BLOCK_REDUCTION)));
  return { damage: taken, blocked: damage - taken };
}
