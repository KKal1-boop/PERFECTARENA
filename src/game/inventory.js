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
import { carriedWeight, maxCarryWeight } from './items.js';

/**
 * The weapon the player is swinging, and what it does.
 *
 * @param {object} character
 * @returns {{id: string, name: string, material: string, materialName: string, min: number, max: number}}
 */
export function weaponCarried(character) {
  // **An absent weapon is a fist**, exactly as the fight reads it (`combat.js`) and as
  // `items.js`'s `weaponHeld` does — not a longsword the character has never held.
  const weapon = weaponById(character?.weapon ?? 'fists') ?? WEAPONS.find((w) => w.id === 'fists');
  const material = materialById(character?.material ?? 'steel') ?? MATERIALS.find((m) => m.id === 'steel');
  // The material has its own two ends (UESP: iron is 0 / −2), exactly as the fight applies
  // them — one flat bonus for both ends was the earlier misreading.
  const min = Math.max(1, weapon.min + (material?.min ?? 0));
  return {
    id: weapon.id,
    name: weapon.name,
    material: material?.id ?? 'steel',
    materialName: material?.name ?? 'Steel',
    min,
    max: Math.max(min, weapon.max + (material?.max ?? 0)),
  };
}

/**
 * Everything the player is carrying, as rows for the panel.
 *
 * @param {object} character
 * @param {{quest?: object, kills?: number, xp?: number, day?: number, side?: string|null}} [world]
 * @returns {{section: string, rows: {name: string, note: string, icon?: string}[]}[]}
 */
export function carried(character, world = {}) {
  const weapon = weaponCarried(character);
  const quest = world.quest ?? {};
  // **One block for the body and the purse.** These were three headings — In hand, Purse,
  // Burden — with a row or two under each, and a pack page whose top half is headings is the
  // owner's *"the gui is shit"*. The same facts read in one list.
  const bag = Array.isArray(world.bag) ? world.bag : (Array.isArray(character?.bag) ? character.bag : []);
  const weight = carriedWeight(character, bag);
  const max = maxCarryWeight(character);
  const sections = [
    {
      section: 'The adventurer',
      // Each row says **which of the install's own glyphs it wears** (`iconRoleFor`): the pack
      // used to be a column of prose, and the owner asked for icons for weapons, armour, spells
      // and potions (2026-10-25). The icon is a *kind*, never a picture of the exact sword.
      rows: [
        { name: `${weapon.name} (${weapon.materialName})`, note: `${weapon.min}–${weapon.max} damage, in hand`, icon: 'weapon' },
        // Agility is attribute 3 (`character.js`'s `ATTRIBUTES` order) and one point of
        // armour class is five of it — `armourClass` takes the attribute, not the actor.
        { name: `${armourClass(attributeOf(character, 'agility', 3, 0))} armour class`, note: 'from Agility, the armour rule UESP states', icon: 'armour' },
        { name: `${character?.gold ?? 0} gold`, note: world.side ? `side work: ${world.side}` : 'earned by the job board', icon: 'coin' },
        // **The burden** — the owner's *"inventory should have max weight and armor should
        // weight also"*. The bar is the character's Strength (`items.js`), and the bag plus
        // everything worn counts, so a plate suit is a decision and not a cosmetic.
        {
          name: `${weight.toFixed(1)} / ${max.toFixed(0)} kg`,
          note: weight > max ? 'overloaded — sell, store or drop something' : 'carried and worn',
          icon: 'misc',
        },
      ],
    },
  ];
  const items = [];
  if (quest.pieces) items.push({ name: `Staff of Chaos — ${quest.pieces}/8 pieces`, note: 'the main quest', icon: 'scroll' });
  if (quest.mithrilKey) items.push({ name: 'Mithril key', note: 'the Imperial Palace', icon: 'scroll' });
  if (quest.hasKeyItem) items.push({ name: 'Jewel of Fire', note: 'the Imperial Palace', icon: 'scroll' });
  if (items.length) sections.push({ section: 'Quest items', rows: items });
  sections.push({
    section: 'The record',
    rows: [
      { name: `${world.kills ?? 0} slain · ${world.xp ?? 0} experience`, note: 'what the fight counted', icon: 'misc' },
      { name: `${world.day ?? 0} days travelled`, note: 'fast travel and the calendar', icon: 'misc' },
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
  // **A blow a ward already ate is not a blow.** The old `Math.max(1, …)` below turned a
  // fully absorbed hit into one point through the guard, which made a ward look broken.
  if (!(Number(damage) > 0)) return { damage: 0, blocked: 0 };
  if (!blocking) return { damage, blocked: 0 };
  const taken = Math.max(1, Math.round(damage * (1 - BLOCK_REDUCTION)));
  return { damage: taken, blocked: damage - taken };
}
