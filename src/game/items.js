// WHAT CAN BE CARRIED, BOUGHT AND USED.
//
// Until this module the port had a *sheet*, not a bag: `game/inventory.js` could only list
// what the game could already prove the player had — the weapon in hand, the purse, the
// main quest's own flags — and it said so out loud, because Arena's item records live in
// `A.EXE`, which this data set does not ship (DECISIONS.md D11), and the `.MIF` `LOOT` and
// `STOR` chunks are decoded for *placement* only (PROGRESS.md S14). That was honest and it
// left the game with no potions, no scrolls, no armour and nothing to pick up but gold.
//
// This module is the bag the rest of the game hangs off: a catalog of things, and the four
// operations a player performs on them — **take, equip, use, drop** — as pure functions over
// a plain array, so a bag is `JSON` on the character (the same discipline as every other
// state in `game/save.js`) and every rule below is testable without a browser.
//
// ## What is the install's and what is this project's
//
//   * **Weapon bases and their damage ranges, and the materials and their modifiers**, are
//     Arena's: `game/combat.js`'s `WEAPONS` and `MATERIALS`, both transcribed from UESP's
//     weapon reference. Every weapon id here is that table's own id, which is the point —
//     `character.weapon` is an id the fight already swings with (`combat.js`'s
//     `weaponById`), so equipping out of the bag needs no translation layer.
//   * **Spell names attached to scrolls** are Arena's too, and they are the names in the
//     install's own `SPELLSG.65`: this project reads that file's 64 named records
//     (`arena/spellsFile.js`), and a scroll here names one of them. A test pins the join, so
//     a scroll that names a spell the install does not have fails rather than doing nothing.
//   * **Everything else is AUTHORED** — prices, weights, armour values, and what a potion's
//     dose is worth. Arena's own item names and price table are in `A.EXE` (D11), exactly as
//     `game/dungeonItems.js`'s loot values and `game/radiantQuests.js`'s `ITEMS` list already
//     are; the vocabulary is Arena's documented equipment (leather/chain/plate, the shield
//     types, the potions the Mages Guild sells), and the numbers are this project's, labelled
//     as such here and printed as such by the shop line (`SERVICES_NOTE`). Logged as S34 in
//     PROGRESS.md.
//
// ## The lists are now complete (the owner's own report)
//
// The owner, 2026-10-17: *"import all armors weapons and magic from og arena to the game"*.
// Two things were missing from a list that was otherwise the install's:
//
//   1. **A weapon in a material.** Arena's weapons are a base crossed with the metal it is
//      made of — that is what its own material table *is*, and `combat.js`'s `MATERIALS` is
//      that table (iron −1 … ebony +5). The catalog listed each base once, with the player's
//      own `character.material` supplyly its edge, so a shelf could not show — and a player
//      could not buy — an **Ebony Longsword**; a smith's stock was one Longsword and eight
//      loose bars of metal. Every base that a smith makes is now listed in every material
//      (`MATERIAL_WEAPONS`, 18 bases × 8 materials), and equipping one sets **both** the
//      weapon and the metal it is made of.
//   2. **The gauntlet.** Arena's armour comes in cuirass, helm, greaves, **gauntlets** and
//      boots, and the game's weapon table already carries `chain-gauntlets` and
//      `plate-gauntlets` *as weapons* — the armour half of the piece was simply absent from
//      the catalog, so a player could never wear one. It is a piece now (`ARMOUR_PIECES`),
//      and the character's `armour` object gains a fifth slot by the same rule the other
//      four already follow: `equipFromBag` writes `armour[item.slot]`, and `armourRating`
//      sums whatever the object holds, so no caller needed a second slot list.
//
// The **magic** half needed no work: `game/spells.js` already carries a meaning for all 64
// named records the install's own `SPELLSG.65` holds (`library.unknown` is empty — pinned by
// `tests/unit/spells.test.mjs`), and the scrolls here name those spells. What this file adds
// is the join that makes it visible from the pack's side: a scroll's spell must be castable,
// which `tests/unit/items.test.mjs` now sweeps over all 64.
//
// ## …and then the rest of Arena's own list (2026-10-17, the equipment pass)
//
// UESP's `Arena:Base Armor` and `Arena:Potions` were read against this catalogue and three
// things were still this project's invention rather than the game's:
//
//   1. **The armour had five pieces; Arena has seven.** The two **pauldrons** (left and
//      right) were missing, and only *plate* comes in the eight metals — leather and chain
//      are their own grades. The catalogue now carries leather, chain, plain plate and the
//      eight plate metals across all seven slots, plus the four shield types in every metal.
//   2. **The potion list was invented.** The port sold "Potion of Shielding", "Potion of
//      Light" and "Potion of Water Breathing", which Arena does not have, and was missing
//      Heal True, Restore Power, Stamina, Purification, Free Action, Invisibility and
//      Strength, which it does. The list below is UESP's fifteen, with its own names.
//   3. **A metal's damage was one number.** UESP's material table separates the low and high
//      ends (iron is 0 / −2); `combat.js` carries both now and every note here prints them.
//
// A retired id is not a lost potion: `RETIRED_IDS` maps the two invented ids an old save may
// still name onto the Arena item that does the same thing, and `itemById` follows it.
//
// ## The bag
//
// A bag is an array of stacks, `[{ id, qty }]`, and **every function here returns a new
// array** — nothing mutates the bag it is given, so the scene can hold the old one until it
// has decided the operation succeeded, and a save is always a consistent bag.
//
//   `character.weapon`   the weapon base id (with `character.material` beside it)
//   `character.shield`   the shield's item id
//   `character.armour`   `{ cuirass, helm, greaves, gauntlets, boots }` of item ids
//
// Worn and held things **stay in the bag**: a player who equips a better longsword has not
// thrown the old one away, and an item that vanished when it was equipped would be an item
// the player could not sell. Nothing here ever destroys a piece of equipment; only a potion
// and a scroll are spent, because they are consumed.

import { ARTIFACTS, canUseArtifact } from './artifacts.js';
import { MATERIALS, WEAPONS, attributeOf, materialById, weaponById } from './combat.js';
import {
  AREA_WEIGHT, AREAS, MATERIAL_PROTECTION, METAL_SHIFT, PIECE_AREAS, SHIELD_AREAS,
  SHIELD_PROTECTION, armourAt, armourRating as ratingOf, coverage as coverageOf, protectionOf,
} from './armour.js';

/** The kinds an item can be. The order is the order a bag is listed in. */
export const ITEM_KINDS = Object.freeze(['weapon', 'armour', 'shield', 'potion', 'scroll', 'misc', 'jewelry']);

/** Kind → its place in `ITEM_KINDS`, for sorting a bag the way a shop lists one. */
const KIND_ORDER = Object.freeze(Object.fromEntries(ITEM_KINDS.map((kind, index) => [kind, index])));

/**
 * The sentence the game prints beside a shop's prices.
 *
 * A player is entitled to know which numbers are Arena's and which are this project's, and
 * this is the same discipline as `HIT_FORMULA_NOTE` in `combat.js`: the vocabulary is the
 * install's, the prices are ours because the originals are inside `A.EXE`.
 */
export const SERVICES_NOTE = 'Arena\'s own equipment, spell and potion names, and its potion '
  + 'prices (Arena:Potions); weapon and armour prices, weights and armour values are this '
  + 'project\'s, because those originals live in A.EXE.';

/**
 * Weapons this project treats as two-handed, by Arena's own weapon list.
 *
 * UESP's weapon reference gives each base's hands for the later games and not for Arena; the
 * bows, the great blades and the warhammer are the ones no illustration of Arena shows with a
 * shield, which is the whole of the reasoning, and it is AUTHORED.
 */
const TWO_HANDED = Object.freeze(['battle-axe', 'claymore', 'warhammer', 'dai-katana', 'long-bow', 'short-bow']);

/**
 * The weapon rows that are a part of the body rather than a thing a smith makes.
 *
 * Arena's weapon table carries all four (`WEAPONS`: `fists`, `leather-gauntlets`,
 * `chain-gauntlets`, `plate-gauntlets`), and each is already a row of the catalog; what they
 * are not is a base a **material** can be worked into, because an iron fist is a fist — and a
 * leather gauntlet is already *named* for its material, so a "steel leather gauntlet" would
 * be a thing Arena does not make. So the material list below skips them, which is the one
 * place Arena's own list needs reading rather than copying.
 */
const BODILY_WEAPONS = Object.freeze(['fists', 'leather-gauntlets', 'chain-gauntlets', 'plate-gauntlets']);

/**
 * AUTHORED: what a weapon costs, from its own damage range.
 *
 * A weapon's worth tracks the damage it does, which is what the install's own table gives
 * (`min` and `max`); the multiplier is chosen so the plain dagger is pocket change and the
 * dai-katana is a thing a player saves for, which is the shape Arena's prices have.
 *
 * @param {{min: number, max: number}} weapon
 * @returns {number} whole gold
 */
function weaponPrice(weapon) {
  const mean = (weapon.min + weapon.max) / 2;
  return Math.max(5, Math.round(mean * weapon.max));
}

/** AUTHORED: what a weapon weighs, from the damage it does (a claymore is heavier than a dagger). */
function weaponWeight(weapon) {
  return Math.max(1, Math.round((weapon.min + weapon.max) / 6));
}

/**
 * AUTHORED: how much a material changes what a weapon of it costs and weighs.
 *
 * The **modifier is Arena's** (`combat.js`'s `MATERIALS`, UESP's weapon reference: iron −1,
 * steel and silver 0, elven +1 … ebony +5); what that modifier does to a *price* is this
 * project's, and it is one rule rather than a table so a material added to `combat.js`
 * tomorrow is priced the day it appears.
 *
 * @param {{damage: number}} material
 * @returns {number} a multiplier, 0.85 for iron … 1.75 for ebony
 */
function materialFactor(material) {
  return 1 + 0.15 * Number(material?.damage ?? 0);
}

/** AUTHORED: what a bar of each metal costs, from the modifier it gives a weapon. */
const MATERIAL_PRICE = Object.freeze({
  iron: 30, steel: 85, silver: 110, elven: 140, dwarven: 195, mithril: 250, adamantium: 305, ebony: 360,
});

/**
 * The three body-armour materials, in Arena's own leather/chain/plate order.
 *
 * **The ratings are UESP's** (`Arena:Base Armor`: leather −3, chain −6, plate −9), written
 * positive because the catalogue and the panel both want a number that goes up. The price and
 * weight are still this project's — no source publishes them.
 */
const ARMOUR_MATERIALS = Object.freeze([
  { material: 'leather', name: 'Leather', armour: MATERIAL_PROTECTION.leather, price: 14, weight: 6 },
  { material: 'chain', name: 'Chain', armour: MATERIAL_PROTECTION.chain, price: 42, weight: 9 },
  { material: 'plate', name: 'Plate', armour: MATERIAL_PROTECTION.plate, price: 115, weight: 15 },
]);

/**
 * The **seven** pieces Arena's armour comes in, and which body area each one covers.
 *
 * UESP's `Arena:Base Armor` lists helm, **left and right pauldron**, cuirass, gauntlets,
 * greaves and boots — the shoulders are separate pieces, and the port had neither — and its
 * "protected area" column is `game/armour.js`'s `PIECE_AREAS`. **Every piece is worth the
 * same rating for its material** (leather −3, chain −6, plate −9): Arena's armour number is
 * the material's, and the *piece* decides where it applies, which is the reading the port had
 * wrong when it gave a cuirass twice a helm's value.
 *
 * `armour` is the positive form of the material's rating (see `armour.js`); `factor` and
 * `weight` are this project's prices and kilos.
 */
const ARMOUR_PIECES = Object.freeze([
  { piece: 'cuirass', name: 'Cuirass', factor: 2.4, weight: 1 },
  { piece: 'helm', name: 'Helm', factor: 1, weight: 0.6 },
  // **The pauldrons**, which the catalogue had left out entirely: Arena's armour is seven
  // pieces, and a shoulder is one of them.
  { piece: 'pauldron-left', name: 'Left Pauldron', factor: 0.8, weight: 0.5 },
  { piece: 'pauldron-right', name: 'Right Pauldron', factor: 0.8, weight: 0.5 },
  { piece: 'greaves', name: 'Greaves', factor: 1.2, weight: 0.8 },
  { piece: 'boots', name: 'Boots', factor: 0.9, weight: 0.5 },
  // **Gauntlets**, which the catalog had left out. Arena's armour is seven pieces, and the
  // game's own weapon table already lists `chain-gauntlets` and `plate-gauntlets` as *weapons*
  // (`combat.js`'s `WEAPONS`) — so the piece exists in Arena and only the armour half was
  // missing here, which meant a player could punch in plate gauntlets but never wear a pair.
  //
  // Its id is the **singular** `-gauntlet` on purpose: `chain-gauntlets` and `plate-gauntlets`
  // are taken by the weapon rows above, and the catalog's ids are unique (a test says so).
  { piece: 'gauntlets', name: 'Gauntlets', suffix: 'gauntlet', factor: 0.7, weight: 0.4 },
]);

/**
 * The eight plate metals, UESP's own ladder — plate is the one armour that is worked in metal.
 *
 * UESP: plate is −9 per piece, and the metal moves it (iron +1 for −8, steel and silver 0,
 * elven −1 … ebony −5 for −14). On the positive scale the fight uses that is **9 plus the
 * metal's shift**: iron 8, steel/silver 9, elven 10 … ebony 14 (`armour.js`'s `METAL_SHIFT`),
 * and every piece of a suit carries its metal's rating. Price and weight stay this project's.
 */
const PLATE_METALS = Object.freeze([
  { material: 'iron', name: 'Iron', armour: MATERIAL_PROTECTION.plate + METAL_SHIFT.iron, price: 95, weight: 14 },
  { material: 'steel', name: 'Steel', armour: MATERIAL_PROTECTION.plate + METAL_SHIFT.steel, price: 115, weight: 15 },
  { material: 'silver', name: 'Silver', armour: MATERIAL_PROTECTION.plate + METAL_SHIFT.silver, price: 145, weight: 15 },
  { material: 'elven', name: 'Elven', armour: MATERIAL_PROTECTION.plate + METAL_SHIFT.elven, price: 220, weight: 14 },
  { material: 'dwarven', name: 'Dwarven', armour: MATERIAL_PROTECTION.plate + METAL_SHIFT.dwarven, price: 300, weight: 15 },
  { material: 'mithril', name: 'Mithril', armour: MATERIAL_PROTECTION.plate + METAL_SHIFT.mithril, price: 380, weight: 13 },
  { material: 'adamantium', name: 'Adamantium', armour: MATERIAL_PROTECTION.plate + METAL_SHIFT.adamantium, price: 460, weight: 15 },
  { material: 'ebony', name: 'Ebony', armour: MATERIAL_PROTECTION.plate + METAL_SHIFT.ebony, price: 540, weight: 16 },
]);

/**
 * A shield in a metal: UESP's four types with the metal's own adjustment.
 *
 * Base ratings are the source's own (−1 buckler … −4 tower); on the positive scale that is
 * 1…4, plus the metal's shift. **The shift is the plate metals' own** (`armour.js`'s
 * `METAL_SHIFT`), iron included: UESP gives an iron shield the same +1 to its rating that iron
 * plate takes, so an iron buckler is worth 0 and an ebony tower shield 9. `factor` is this
 * project's price multiplier.
 */
const SHIELD_METALS = Object.freeze([
  { material: 'iron', name: 'Iron', shift: METAL_SHIFT.iron, factor: 0.8 },
  { material: 'steel', name: 'Steel', shift: METAL_SHIFT.steel, factor: 1 },
  { material: 'silver', name: 'Silver', shift: METAL_SHIFT.silver, factor: 1.25 },
  { material: 'elven', name: 'Elven', shift: METAL_SHIFT.elven, factor: 1.5 },
  { material: 'dwarven', name: 'Dwarven', shift: METAL_SHIFT.dwarven, factor: 1.9 },
  { material: 'mithril', name: 'Mithril', shift: METAL_SHIFT.mithril, factor: 2.3 },
  { material: 'adamantium', name: 'Adamantium', shift: METAL_SHIFT.adamantium, factor: 2.7 },
  { material: 'ebony', name: 'Ebony', shift: METAL_SHIFT.ebony, factor: 3.1 },
]);

/**
 * **Every weapon Arena makes, in every material Arena makes it of** — the list the owner asked
 * for (*"import all armors weapons … from og arena"*), built as a base crossed with `MATERIALS`
 * rather than written out.
 *
 * A weapon in Arena **is** a base and a metal: that is what its material table means, and it is
 * why the plain base rows still exist beside these — the base row is `character.weapon`'s own id
 * (a save, the class kit, `combat.js`'s fight) and this one is a thing on a shelf with a price on
 * it. Equipping one sets **both** halves (`equipFromBag`), so a player who buys the ebony
 * longsword swings an ebony longsword and the panel prints the range that follows.
 *
 * `damage` stays the **base's** range and the material is carried beside it, which is what keeps
 * `weaponHeld`'s arithmetic single-sourced: exactly one material modifier is added to a weapon,
 * whether the player set `character.material` by hand (the old path) or equipped an item that
 * names a metal. `itemNote` applies the modifier for the *line* it prints, so a shelf still
 * promises the number the fight will roll.
 *
 * @type {ReadonlyArray<object>}
 */
const MATERIAL_WEAPONS = Object.freeze(WEAPONS
  .filter((weapon) => !BODILY_WEAPONS.includes(weapon.id))
  .flatMap((weapon) => MATERIALS.map((material) => Object.freeze({
    id: `${material.id}-${weapon.id}`,
    kind: 'weapon',
    name: `${material.name} ${weapon.name}`,
    // The two joins: the base the fight swings (`weaponById`) and the metal's own row.
    weapon: weapon.id,
    material: material.id,
    damage: Object.freeze({ min: weapon.min, max: weapon.max }),
    hands: TWO_HANDED.includes(weapon.id) ? 'two' : 'one',
    price: Math.max(5, Math.round(weaponPrice(weapon) * materialFactor(material))),
    weight: Math.max(1, Math.round(weaponWeight(weapon) * materialFactor(material))),
  }))));

/**
 * The four shield types: UESP's own −1…−4 ratings, as positive protection, and the areas each
 * one covers (`armour.js`'s `SHIELD_AREAS`). Prices and weights are this project's.
 *
 * `type` is carried on the item so the fight can ask *which* shield without parsing an id:
 * `elven-kite-shield` is a kite shield, and it protects hands, arm, waist and legs.
 */
const SHIELD_ROWS = Object.freeze([
  { id: 'buckler', name: 'Buckler', armour: SHIELD_PROTECTION.buckler, price: 45, weight: 4 },
  { id: 'round-shield', name: 'Round Shield', armour: SHIELD_PROTECTION['round-shield'], price: 90, weight: 6 },
  { id: 'kite-shield', name: 'Kite Shield', armour: SHIELD_PROTECTION['kite-shield'], price: 180, weight: 9 },
  { id: 'tower-shield', name: 'Tower Shield', armour: SHIELD_PROTECTION['tower-shield'], price: 340, weight: 14 },
]);

/**
 * A shield in a metal: the base row's own id stays the steel-equivalent, and the eight metals
 * are listed beside it (UESP's shield table has a material modifier for every one).
 */
const METAL_SHIELDS = Object.freeze(SHIELD_ROWS.flatMap((row) => SHIELD_METALS.map((metal) => Object.freeze({
  id: `${metal.material}-${row.id}`,
  kind: 'shield',
  name: `${metal.name} ${row.name}`,
  material: metal.material,
  type: row.id,
  armour: row.armour + metal.shift,
  price: Math.max(5, Math.round(row.price * metal.factor)),
  weight: Math.max(1, Math.round(row.weight * (1 + metal.shift * 0.08))),
}))));

/**
 * UESP's fifteen potions — the whole list, with Arena's own names.
 *
 * Read from `Arena:Potions` (2026-10-17). The port used to sell three potions Arena does not
 * have (Shielding, Light, Water Breathing) and was missing seven it does. Each `effect.kind`
 * is one `useFromBag` (and the scene) applies.
 *
 * **The prices are UESP's now.** They used to be this project's, because the project believed
 * the originals were inside `A.EXE`; `Arena:Potions` prints all fifteen, so the excuse is gone
 * and the shelf charges Arena's own money: 25 for Stamina up to 500 for Purification.
 *
 * **The doses follow the source's own rule**: UESP says a potion's effect is the corresponding
 * spell **cast at level 16**. So Heal (1–15 + 1–5/level) is 17–95 there — 56 at its midpoint —
 * and Heal True (25–50 + 5/level) is 105–130, 117 mid. The figures UESP states outright are
 * copied rather than derived: Restore Power gives **25 spell points**, Strength is Orc
 * Strength's **+15**, and Purification is Purify's **100 health, cure poison and Sanctuary**.
 * The resistance draughts give `power: 3`, which is this project's own point scale for a
 * resistance (`bestiary.js` reads three points as 30%), because a potion grants the state
 * outright where the spell rolls for it.
 *
 *   heal · restorePower · stamina · purify · freeAction · cure · levitate · invisibility ·
 *   strength · resist
 */
const POTION_ROWS = Object.freeze([
  { id: 'potion-stamina', name: 'Potion of Stamina', power: 40, price: 25, weight: 0.5, effect: { kind: 'stamina' } },
  { id: 'potion-heal', name: 'Potion of Healing', power: 56, price: 50, weight: 0.5, effect: { kind: 'heal' } },
  { id: 'potion-strength', name: 'Potion of Strength', power: 15, price: 50, weight: 0.5, effect: { kind: 'strength' } },
  { id: 'potion-restore-power', name: 'Potion of Restore Power', power: 25, price: 75, weight: 0.5, effect: { kind: 'restorePower' } },
  { id: 'potion-resist-fire', name: 'Potion of Resist Fire', power: 3, price: 75, weight: 0.5, effect: { kind: 'resist', element: 'fire' } },
  { id: 'potion-resist-cold', name: 'Potion of Resist Cold', power: 3, price: 75, weight: 0.5, effect: { kind: 'resist', element: 'cold' } },
  { id: 'potion-resist-shock', name: 'Potion of Resist Shock', power: 3, price: 75, weight: 0.5, effect: { kind: 'resist', element: 'shock' } },
  { id: 'potion-heal-true', name: 'Potion of Heal True', power: 117, price: 100, weight: 0.5, effect: { kind: 'heal' } },
  { id: 'potion-cure-disease', name: 'Potion of Cure Disease', power: 1, price: 100, weight: 0.5, effect: { kind: 'cure', element: 'disease' } },
  { id: 'potion-levitate', name: 'Potion of Levitation', power: 1, price: 125, weight: 0.5, effect: { kind: 'levitate' } },
  { id: 'potion-resist-poison', name: 'Potion of Resist Poison', power: 3, price: 125, weight: 0.5, effect: { kind: 'resist', element: 'poison' } },
  { id: 'potion-free-action', name: 'Potion of Free Action', power: 1, price: 150, weight: 0.5, effect: { kind: 'freeAction' } },
  { id: 'potion-cure-poison', name: 'Potion of Cure Poison', power: 1, price: 200, weight: 0.5, effect: { kind: 'cure', element: 'poison' } },
  { id: 'potion-invisibility', name: 'Potion of Invisibility', power: 1, price: 250, weight: 0.5, effect: { kind: 'invisibility' } },
  { id: 'potion-purification', name: 'Potion of Purification', power: 100, price: 500, weight: 0.5, effect: { kind: 'purify' } },
]);

/**
 * The ids an earlier catalogue invented, mapped onto the Arena item that does the same thing.
 *
 * A save is a player's own file; a potion that vanishes because this project learned the
 * game's real list would be a bug in their pack, not a correction. `itemById` follows the
 * alias, and `addToBag` stores the real id, so a pack heals rather than accumulating ghosts.
 */
export const RETIRED_IDS = Object.freeze({
  'potion-heal-great': 'potion-heal-true',
});

/**
 * AUTHORED: the spell scrolls, each naming one of the install's own spells.
 *
 * Every `spell` here is a record in `SPELLSG.65` — the 64 named ones `arena/spellsFile.js`
 * reads — so a scroll is a *cast* the game can really perform rather than a sentence about
 * one. The prices track the spell's own cost in the file (`record.points`), which is the one
 * number here that is Arena's.
 */
const SCROLL_ROWS = Object.freeze([
  { id: 'scroll-light-heal', name: 'Scroll of Light Heal', spell: 'Light Heal', price: 70 },
  { id: 'scroll-fire-dart', name: 'Scroll of Fire Dart', spell: 'Fire Dart', price: 90 },
  { id: 'scroll-heal', name: 'Scroll of Heal', spell: 'Heal', price: 130 },
  { id: 'scroll-levitate', name: 'Scroll of Levitation', spell: 'Levitate', price: 60 },
  { id: 'scroll-invisibility', name: 'Scroll of Invisibility', spell: 'Invisibility', price: 160 },
  { id: 'scroll-shield', name: 'Scroll of Shielding', spell: 'Shield', price: 260 },
  { id: 'scroll-open', name: 'Scroll of Open', spell: 'Open', price: 300 },
  { id: 'scroll-wizard-lock', name: 'Scroll of Wizard Lock', spell: 'Wizard Lock', price: 300 },
  { id: 'scroll-resist-fire', name: 'Scroll of Resist Fire', spell: 'Resist Fire', price: 300 },
  { id: 'scroll-fireball', name: 'Scroll of Fireball', spell: 'Fireball', price: 330 },
  { id: 'scroll-cure-poison', name: 'Scroll of Cure Poison', spell: 'Cure Poison', price: 350 },
  { id: 'scroll-spell-shield', name: 'Scroll of Spell Shield', spell: 'Spell Shield', price: 400 },
  { id: 'scroll-fire-storm', name: 'Scroll of Fire Storm', spell: 'Fire Storm', price: 500 },
  // The control spells a fighter may need and no class starts with: a caster silenced or a
  // foe sent running is a fight changed, and a scroll is how Arena lets a non-caster do it.
  { id: 'scroll-silence', name: 'Scroll of Silence', spell: 'Silence', price: 260 },
  { id: 'scroll-witchs-curse', name: 'Scroll of Witch\'s Curse', spell: 'Witch\'s Curse', price: 240 },
]);

/**
 * **ARROWS — the one thing a bow spends.**
 *
 * The owner, 2026-10-18: *"make the bow consume arrows from your inventory to work that you need
 * to be able to buy"*. Arena's bow is a weapon whose damage is its own base (`combat.js`: short
 * bow 2–8, long bow 2–12) and its ammunition is ammunition in the same table the arrows come
 * from; the install sells arrows in the equipment store's own shelf. The **price and weight are
 * this project's** (Arena's item prices are in `A.EXE`, D11) and `bundle` is how many come off
 * one purchase — a quiver's worth, so a bowman buys arrows rather than clicking twenty times.
 */
const AMMO_ROWS = Object.freeze([
  { id: 'arrow', name: 'Arrow', price: 30, weight: 0.1, bundle: 20 },
]);

/** Every ammunition id, for the bow's own check (`game/archery.js`'s note on what a shot spends). */
export const AMMO_IDS = Object.freeze(AMMO_ROWS.map((row) => row.id));

/** The scrolls whose spell the port can also *cast* as a spell in its own right. */
export const SCROLL_SPELLS = Object.freeze(SCROLL_ROWS.map((row) => row.spell));

/**
 * The catalog: every weapon base, every material as a bar, the armour, the shields, the
 * potions and the scrolls, in `ITEM_KINDS` order.
 *
 * Built rather than written out so the joins are visible in one place: a weapon's id *is*
 * `combat.js`'s weapon id and a bar's id *is* its material id, which is what lets
 * `character.weapon` and `character.material` keep their existing meaning.
 *
 * @type {ReadonlyArray<{id: string, kind: string, name: string, price: number, weight: number,
 *   weapon?: string, damage?: {min: number, max: number}, hands?: string, armour?: number,
 *   slot?: string, material?: string,
 *   effect?: {kind: string, power: number, element?: string, spell?: string}}>}
 *
 * `weapon` is present **only** on a weapon in a material (`MATERIAL_WEAPONS`): it is the base id
 * `character.weapon` takes and the fight resolves (`weaponById`), with `material` beside it as
 * the metal `equipFromBag` writes. A plain base row carries neither — its `id` already is the
 * base.
 */
export const ITEMS = Object.freeze([
  ...WEAPONS.map((weapon) => Object.freeze({
    id: weapon.id,
    kind: 'weapon',
    name: weapon.name,
    price: weaponPrice(weapon),
    weight: weaponWeight(weapon),
    damage: Object.freeze({ min: weapon.min, max: weapon.max }),
    hands: TWO_HANDED.includes(weapon.id) ? 'two' : 'one',
  })),
  // …and every one of those bases in every material a smith works (see `MATERIAL_WEAPONS`).
  ...MATERIAL_WEAPONS,
  ...MATERIALS.map((material) => Object.freeze({
    id: material.id,
    kind: 'misc',
    name: `${material.name} Bar`,
    material: material.id,
    price: MATERIAL_PRICE[material.id] ?? 85,
    weight: 3,
    // A bar is not a thing a traveller uses; it is what a smith works with, and selling it
    // is what it is for. `useFromBag` says so rather than inventing an effect for it.
    effect: Object.freeze({ kind: 'material', power: material.damage, element: material.id }),
  })),
  // Leather and chain are their own grades, across all seven pieces. **Every piece of a grade
  // is worth that grade's rating** (UESP's armour number is the material's; only the area
  // changes), which is why the piece's `armour` factor is gone from this line.
  ...ARMOUR_MATERIALS.filter((row) => row.material !== 'plate').flatMap((row) => ARMOUR_PIECES.map((piece) => Object.freeze({
    id: `${row.material}-${piece.suffix ?? piece.piece}`,
    kind: 'armour',
    name: `${row.name} ${piece.name}`,
    slot: piece.piece,
    material: row.material,
    armour: row.armour,
    price: Math.max(5, Math.round(row.price * piece.factor)),
    weight: Math.max(1, Math.round(row.weight * piece.weight)),
  }))),
  // **Plate**, the one armour worked in metal: the unprefixed row is the steel-equivalent
  // (UESP: unspecified plate has steel's rating and iron's look), then each of the eight.
  ...ARMOUR_MATERIALS.filter((row) => row.material === 'plate').flatMap((row) => ARMOUR_PIECES.map((piece) => Object.freeze({
    id: `${row.material}-${piece.suffix ?? piece.piece}`,
    kind: 'armour',
    name: `${row.name} ${piece.name}`,
    slot: piece.piece,
    material: row.material,
    armour: row.armour,
    price: Math.max(5, Math.round(row.price * piece.factor)),
    weight: Math.max(1, Math.round(row.weight * piece.weight)),
  }))),
  ...PLATE_METALS.flatMap((metal) => ARMOUR_PIECES.map((piece) => Object.freeze({
    id: `${metal.material}-plate-${piece.suffix ?? piece.piece}`,
    kind: 'armour',
    name: `${metal.name} Plate ${piece.name}`,
    slot: piece.piece,
    material: metal.material,
    armour: metal.armour,
    price: Math.max(5, Math.round(metal.price * piece.factor)),
    weight: Math.max(1, Math.round(metal.weight * piece.weight)),
  }))),
  ...SHIELD_ROWS.map((row) => Object.freeze({
    id: row.id, kind: 'shield', name: row.name, type: row.id, armour: row.armour, price: row.price, weight: row.weight,
  })),
  ...METAL_SHIELDS,
  ...AMMO_ROWS.map((row) => Object.freeze({
    id: row.id,
    kind: 'misc',
    name: row.name,
    price: row.price,
    weight: row.weight,
    bundle: row.bundle,
    ammo: true,
    effect: Object.freeze({ kind: 'ammo', power: 1 }),
  })),
  ...POTION_ROWS.map((row) => Object.freeze({
    id: row.id,
    kind: 'potion',
    name: row.name,
    price: row.price,
    weight: row.weight,
    effect: Object.freeze({ kind: row.effect.kind, power: row.power, element: row.effect.element ?? null }),
  })),
  ...SCROLL_ROWS.map((row) => Object.freeze({
    id: row.id,
    kind: 'scroll',
    name: row.name,
    price: row.price,
    weight: 0.2,
    effect: Object.freeze({ kind: 'spell', power: 1, spell: row.spell }),
  })),
]);

/** The catalog by id, built once. */
const BY_ID = new Map(ITEMS.map((item) => [item.id, item]));
for (const artifact of ARTIFACTS) {
  const base = BY_ID.get(artifact.base);
  BY_ID.set(artifact.id, Object.freeze({ weight: 0, kind: 'misc', ...base, ...artifact }));
}

/**
 * One item from the catalog.
 *
 * @param {string} id
 * @returns {object|null} the item, or null when nothing in the catalog has that id
 */
export function itemById(id) {
  if (id == null) return null;
  const wanted = String(id).toLowerCase();
  return BY_ID.get(wanted) ?? BY_ID.get(RETIRED_IDS[wanted] ?? '') ?? null;
}

/**
 * Every item of one kind, cheapest first — the order a shop's shelf is in.
 *
 * @param {string} kind  one of `ITEM_KINDS`
 * @returns {object[]}
 */
export function itemsOfKind(kind) {
  return ITEMS.filter((item) => item.kind === kind).slice().sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

/**
 * What an item costs, or what a shop pays for it.
 *
 * **AUTHORED**, and the one rule the whole economy runs on: a shop pays a third of what it
 * charges (plus or minus the shopkeeper's regard for the player), because Arena's own price
 * table is in `A.EXE` and a game with no prices at all has no shops. Buying is the list
 * price adjusted the other way, so a shop that likes the player is a shop that deals.
 *
 * @param {object|null} item
 * @param {{selling?: boolean, regard?: number}} [opts]
 *   `selling` is a shop buying *from* the player; `regard` is `game/regard.js`'s ledger for
 *   that shopkeeper (−50…50 is meaningful, anything further is clamped)
 * @returns {number} whole gold, never less than one coin
 */
export function priceOf(item, opts = {}) {
  if (!item) return 0;
  const base = Math.max(1, Math.round(Number(item.price) || 0));
  const regard = Number.isFinite(opts.regard) ? Math.max(-50, Math.min(50, opts.regard)) : 0;
  if (!opts.selling) return Math.max(1, Math.round(base * (1 - regard / 100)));
  return Math.max(1, Math.round(base * (0.35 + regard / 300)));
}

/** A fresh, empty bag. */
export function createBag() {
  return [];
}

// ── WEIGHT AND WHAT A BACK CAN BEAR ─────────────────────────────────────────
//
// The owner, 2026-10-19: *"inventory should have max weight and armor should weight also"*.
// Every catalogued item already carried a `weight` (this file's own kilos, AUTHORED); what was
// missing was a **bag that added them up**, and a limit. The limit is Strength's, which is the
// attribute Arena and its siblings tie load to, and the shape is this project's:
//
//   max load = 50 kg + 2 kg per point of Strength
//
// A starting character's Strength is 30–50, so the first pack bears 110–150 kg; a suit of plate
// is deliberately heavy (a plate cuirass is 36 kg here, a whole suit near 90), which is what
// makes the choice between plate and leather a choice. The base and the multiplier are
// **RECONSTRUCTED** — `A.EXE` holds the original's own load rule and is not in this checkout
// (D11) — and the inventory panel prints the number so a player can see it.

/** The load every character can bear before Strength adds anything, in kilos. RECONSTRUCTED. */
export const MAX_LOAD_BASE = 50;
/** How many kilos one point of Strength adds. RECONSTRUCTED. */
export const MAX_LOAD_PER_STRENGTH = 2;

/**
 * The most a character can carry, in kilos.
 *
 * @param {object} character
 * @returns {number}
 */
export function maxCarryWeight(character) {
  // Orc Strength and the Strength potion raise the attribute itself (`strengthBuff`), so the
  // same buff that makes an arm heavier also makes the back stronger.
  const strength = attributeOf(character, 'strength', 0, 50) + Math.max(0, Number(character?.strengthBuff) || 0);
  return MAX_LOAD_BASE + MAX_LOAD_PER_STRENGTH * Math.max(0, strength);
}

/** One item's weight, rounded to a tenth of a kilo. @param {object|null} item @returns {number} */
export function itemWeight(item) {
  const kilos = Number(item?.weight);
  return Number.isFinite(kilos) && kilos > 0 ? kilos : 0;
}

/**
 * Everything a character is carrying, in kilos.
 *
 * The bag is the list, and **worn and held things count even when they are not in it**: a
 * starting character's leather cuirass is written into `character.armour` by the kit, and a
 * piece equipped from the pack stays in the pack (equipping never destroys anything), so the
 * count is the bag plus any equipped item the bag does not already hold. That is what keeps
 * armour weight real without counting the same cuirass twice.
 *
 * @param {object} character
 * @param {object[]} bag
 * @returns {number} kilos, to one decimal
 */
export function carriedWeight(character, bag) {
  const list = stacks(bag);
  const held = new Set();
  let total = 0;
  for (const stack of list) {
    const item = itemById(stack.id);
    if (!item) continue;
    held.add(item.id);
    total += itemWeight(item) * Number(stack.qty);
  }
  const equipped = [
    character?.weapon && character.weapon !== 'fists' ? character.weapon : null,
    character?.shield ?? null,
    ...Object.values(character?.armour ?? {}),
  ].filter((id) => typeof id === 'string' && id);
  for (const id of new Set(equipped)) {
    if (held.has(id)) continue;
    total += itemWeight(itemById(id));
  }
  return Math.round(total * 10) / 10;
}

/**
 * Whether a character can add something to their pack.
 *
 * @param {object} character
 * @param {object[]} bag
 * @param {object|string|null} item  the item or its id; null asks only about the pack as it is
 * @param {number} [qty]
 * @returns {{ok: boolean, weight: number, max: number, over: number, atLimit: boolean, reason: string}}
 */
export function carryStatus(character, bag, item = null, qty = 1) {
  const record = typeof item === 'string' ? itemById(item) : item;
  const extra = record ? itemWeight(record) * Math.max(1, Math.round(Number(qty) || 1)) : 0;
  const weight = Math.round((carriedWeight(character, bag) + extra) * 10) / 10;
  const max = maxCarryWeight(character);
  const over = Math.max(0, Math.round((weight - max) * 10) / 10);
  // **At the limit is already full.** A weightless find would pass the `over > 0` test and
  // still let a player who cannot lift another gram keep looting; `atLimit` is the callers'
  // word for "the back is full", and the loot paths refuse on it even when the object weighs
  // nothing.
  const atLimit = weight >= max;
  if (over > 0) {
    return {
      ok: false,
      weight, max, over, atLimit: true,
      reason: `${record ? `${record.name} would put ` : ''}your load at ${weight.toFixed(1)} kg — ${over.toFixed(1)} kg past the ${max.toFixed(0)} kg a Strength of ${attributeOf(character, 'strength', 0, 50)} can bear.`,
    };
  }
  return {
    ok: true, weight, max, over: 0, atLimit,
    reason: atLimit
      ? `${weight.toFixed(1)} / ${max.toFixed(0)} kg — your load is full.`
      : `${weight.toFixed(1)} / ${max.toFixed(0)} kg`,
  };
}

/** The stacks of a bag, tolerating anything a save file may have left behind. */
function stacks(bag) {
  if (!Array.isArray(bag)) return [];
  return bag.filter((stack) => stack && typeof stack.id === 'string' && Number.isFinite(Number(stack.qty)) && Number(stack.qty) > 0);
}

/** How many of an item a bag holds. @param {object[]} bag @param {string} id @returns {number} */
export function countInBag(bag, id) {
  const wanted = String(id ?? '').toLowerCase();
  return stacks(bag).reduce((total, stack) => (stack.id.toLowerCase() === wanted ? total + Number(stack.qty) : total), 0);
}

/**
 * Put items in the bag — a **new** bag, so the caller keeps the old one until it is sure.
 *
 * @param {object[]} bag
 * @param {string|object} idOrItem  an item id or an item record
 * @param {number} [qty]
 * @returns {object[]}
 */
export function addToBag(bag, idOrItem, qty = 1) {
  const item = typeof idOrItem === 'string' ? itemById(idOrItem) : idOrItem;
  const amount = Math.max(0, Math.round(Number(qty) || 0));
  if (!item || !amount) return stacks(bag).map((stack) => ({ ...stack }));
  const out = stacks(bag).map((stack) => ({ ...stack }));
  const existing = out.find((stack) => stack.id === item.id);
  if (existing) existing.qty += amount;
  else out.push({ id: item.id, qty: amount });
  return out;
}

/**
 * Take items out of the bag. Asking for more than is carried takes what is there, which is
 * what a shop's "sell" button means when it is pressed on the last potion.
 *
 * @param {object[]} bag @param {string} id @param {number} [qty]
 * @returns {object[]}
 */
export function removeFromBag(bag, id, qty = 1) {
  const wanted = String(id ?? '').toLowerCase();
  const amount = Math.max(0, Math.round(Number(qty) || 0));
  const out = [];
  for (const stack of stacks(bag)) {
    if (stack.id.toLowerCase() !== wanted) { out.push({ ...stack }); continue; }
    const left = stack.qty - amount;
    if (left > 0) out.push({ id: stack.id, qty: left });
  }
  return out;
}

/**
 * One line about an item, for a bag list: what it does, in the game's own terms.
 *
 * @param {object} item
 * @returns {string}
 */
export function itemNote(item) {
  if (!item) return '';
  if (item.kind === 'weapon') {
    // A weapon **in a material** prints the range it will really roll — the base's own range
    // plus its material's modifier, floored at 1 — which is the same arithmetic `weaponHeld`
    // and `combat.js`'s `resolveAttack` do. The plain base rows print their own range
    // unchanged: they carry no material, and the character's own `material` supplies the edge
    // for them exactly as it always did.
    const material = item.material ? materialById(item.material) : null;
    const min = Math.max(1, item.damage.min + (material?.min ?? 0));
    const max = Math.max(min, item.damage.max + (material?.max ?? 0));
    return `${min}–${max} damage${item.hands === 'two' ? ', two-handed' : ''}`;
  }
  if (item.kind === 'armour') return `${item.armour} armour (${item.slot})`;
  if (item.kind === 'shield') return `${item.armour} armour, held`;
  if (item.kind === 'misc' && item.material) {
    const material = materialById(item.material);
    const sign = (value) => (value >= 0 ? '+' : '');
    return `smithing: ${sign(material.min)}${material.min}–${sign(material.max)}${material.max} damage, ${sign(material.hit)}${material.hit} to hit`;
  }
  if (item.effect?.kind === 'heal') return `heals ${item.effect.power} health`;
  if (item.effect?.kind === 'restorePower') return `restores ${item.effect.power} spell points`;
  if (item.effect?.kind === 'stamina') return `restores ${item.effect.power} fatigue`;
  if (item.effect?.kind === 'purify') return `heals ${item.effect.power}, clears poison, disease and holds, and raises a ward`;
  if (item.effect?.kind === 'freeAction') return 'breaks a hold that binds you';
  if (item.effect?.kind === 'invisibility') return 'nothing sees you';
  if (item.effect?.kind === 'strength') return `+${item.effect.power} Strength`;
  if (item.effect?.kind === 'cure') return `cures ${item.effect.element}`;
  if (item.effect?.kind === 'resist') return `resists ${item.effect.element}`;
  if (item.effect?.kind === 'shield') return `a ward of ${item.effect.power}`;
  if (item.effect?.kind === 'light') return 'light to see by';
  if (item.effect?.kind === 'levitate') return 'you walk on the air';
  if (item.effect?.kind === 'spell') return `casts ${item.effect.spell}`;
  return '';
}

/**
 * The bag as a list of rows — the shape an inventory panel draws.
 *
 * `index` is the row's place in this list, which is what a UI's click handler needs; the id
 * is what every operation here takes, because a bag can be re-sorted between a draw and a
 * click and an index cannot survive that.
 *
 * @param {object[]} bag
 * @returns {{index: number, id: string, name: string, kind: string, qty: number, note: string}[]}
 */
/**
 * Which of the install's command icons a kind of thing wears.
 *
 * Arena's command strip (`S2.IMG`, 320×36) is **ten 32-pixel buttons**: crossed swords, two
 * heraldic shields, two figures, a gold sunburst, a pointing hand, a fist, the winged staff, a
 * marked map, a scroll and a cross-staff. Those are the game's own glyphs — the same strip the
 * original put at the foot of the screen — so they are what the pack and the spellbook wear:
 * a weapon takes the swords, armour the shields, a spell the sunburst, a potion the winged staff
 * (Arena's own healing mark), a scroll the scroll. Nothing is drawn here; `engine/ui/guiKit.js`
 * cuts the cells and `game/arenaGui.js` publishes them as `--gk-icon-0` … `--gk-icon-9`.
 *
 * @param {string} kind  an item's own `kind`
 * @returns {'weapon'|'armour'|'potion'|'scroll'|'spell'|'misc'}
 */
export function iconRoleFor(kind) {
  switch (kind) {
    case 'weapon': case 'ammo': return 'weapon';
    case 'armour': case 'shield': case 'jewelry': case 'material': return 'armour';
    case 'potion': return 'potion';
    case 'scroll': return 'scroll';
    case 'spell': return 'spell';
    default: return 'misc';
  }
}

export function bagRows(bag) {
  return stacks(bag)
    .map((stack) => ({ stack, item: itemById(stack.id) }))
    .filter((row) => row.item)
    .sort((a, b) => (KIND_ORDER[a.item.kind] ?? 9) - (KIND_ORDER[b.item.kind] ?? 9)
      || a.item.name.localeCompare(b.item.name))
    .map((row, index) => ({
      index,
      id: row.item.id,
      name: row.item.name,
      kind: row.item.kind,
      qty: row.stack.qty,
      note: itemNote(row.item),
    }));
}

/**
 * What a shop would pay for the whole bag, at a shopkeeper who neither likes nor dislikes
 * the player.
 *
 * @param {object[]} bag
 * @returns {number}
 */
export function bagValue(bag) {
  return stacks(bag).reduce((total, stack) => {
    const item = itemById(stack.id);
    return item ? total + priceOf(item, { selling: true }) * stack.qty : total;
  }, 0);
}

/**
 * Equip something out of the bag: a weapon goes in the hand, a shield in the other, armour
 * on the body.
 *
 * The item **stays in the bag** (see this file's header): equipping is a choice about what
 * to use, not about what to own, and an item that disappeared into a slot could not be sold.
 * Displaced equipment does not need its own move for the same reason — the thing you were
 * wearing is still in the bag, one list away.
 *
 * @param {object} character
 * @param {object[]} bag
 * @param {string} id
 * @returns {{ok: boolean, reason?: string, character: object, bag: object[], note: string}}
 */
export function equipFromBag(character, bag, id) {
  const item = itemById(id);
  if (!item) return { ok: false, reason: `there is no ${id} to equip`, character, bag: stacks(bag), note: '' };
  if (!countInBag(bag, item.id)) {
    return { ok: false, reason: `you are not carrying a ${item.name.toLowerCase()}`, character, bag: stacks(bag), note: '' };
  }
  if (item.artifact && !canUseArtifact(character, item.id)) {
    return { ok: false, reason: `your class cannot use ${item.name}`, character, bag: stacks(bag), note: '' };
  }
  if (item.kind === 'weapon') {
    // **A weapon in a material sets its own metal.** The base row leaves `character.material`
    // alone (the player may have chosen one); an item that names a metal *is* that metal, so
    // equipping an ebony longsword is not an ebony sword swung with yesterday's steel edge.
    const material = materialById(item.material ?? character?.material ?? 'steel');
    const min = Math.max(1, item.damage.min + material.min);
    const max = Math.max(min, item.damage.max + material.max);
    const armed = { ...character, weapon: item.weapon ?? item.id, weaponItem: item.id };
    if (item.material) armed.material = item.material;
    return {
      ok: true,
      character: armed,
      bag: stacks(bag),
      note: `${item.name} in hand — ${min}–${max} damage with ${/^[aeiou]/i.test(material.name) ? 'an' : 'a'} ${material.name.toLowerCase()} edge.`,
    };
  }
  if (item.kind === 'jewelry') {
    return { ok: true, character: { ...character, jewelry: { ...(character.jewelry ?? {}), [item.slot]: item.id } }, bag: stacks(bag), note: `${item.name} worn.` };
  }
  if (item.kind === 'shield') {
    return {
      ok: true,
      character: { ...character, shield: item.id },
      bag: stacks(bag),
      note: `${item.name} on your arm — ${item.armour} more armour.`,
    };
  }
  if (item.kind === 'armour') {
    const worn = { ...(character?.armour ?? {}) };
    worn[item.slot] = item.id;
    return {
      ok: true,
      character: { ...character, armour: worn },
      bag: stacks(bag),
      note: `${item.name} worn — ${item.armour} more armour.`,
    };
  }
  return {
    ok: false,
    reason: `a ${item.name.toLowerCase()} is not something you wear or swing — use it, or sell it`,
    character,
    bag: stacks(bag),
    note: '',
  };
}

/**
 * **TAKE SOMETHING OFF THE BODY** when it is no longer owned.
 *
 * Equipment is not taken *out* of the bag when it is worn (see `equipFromBag`: owning and
 * using are two decisions), which is right for a pack but wrong the moment the last copy is
 * sold: the player's purse grew and their hand still held a sword somebody else now owns.
 * This is the law that closes it — the owner, 2026-10-22: *"if you sell something it needs to
 * get unequipped"*.
 *
 * It answers a **copy** of the character, so the caller decides when the change is real, and
 * it reports what came off so a line can say so.
 *
 * @param {object} character
 * @param {string} id  the item's catalogue id
 * @returns {{character: object, unequipped: string[], note: string}}
 */
export function unequipItem(character, id) {
  const item = itemById(id);
  if (!character || !item) return { character, unequipped: [], note: '' };
  const next = { ...character };
  const off = [];
  if (item.kind === 'weapon' && (character.weaponItem === id
    || (!character.weaponItem && item.weapon && character.weapon === item.weapon))) {
    // A fist is what is left in an empty hand — the same reading `weaponHeld` gives.
    next.weapon = 'fists';
    next.weaponItem = null;
    off.push('weapon');
  }
  if (item.kind === 'shield' && character.shield === id) {
    next.shield = null;
    off.push('shield');
  }
  if (item.kind === 'armour' && character.armour && Object.values(character.armour).includes(id)) {
    const worn = { ...character.armour };
    for (const [slot, wornId] of Object.entries(worn)) if (wornId === id) delete worn[slot];
    next.armour = worn;
    off.push('armour');
  }
  if (item.kind === 'jewelry' && character.jewelry && Object.values(character.jewelry).includes(id)) {
    const worn = { ...character.jewelry };
    for (const [slot, wornId] of Object.entries(worn)) if (wornId === id) delete worn[slot];
    next.jewelry = worn;
    off.push('jewellery');
  }
  // **The sale, the drop, the chest — the same law.** Whatever took the last copy out of the
  // pack (a shop's till, the ground, a chest at home, an artifact burning out) leaves nothing
  // on the body: the caller only has to say that the pack no longer holds it.
  const note = off.length ? `${item.name} came off your body.` : '';
  return { character: off.length ? next : character, unequipped: off, note };
}

/**
 * Use something out of the bag: a potion is drunk, a scroll is read.
 *
 * The **effect is handed back, not applied to the world**: this module knows what a potion
 * does to a *character*, and it does not know what a ward, a light or a levitation does to a
 * scene with a camera and monsters in it. What it does apply is the part that is the
 * character's own — health, the afflictions a cure clears, the resistances a resist raises —
 * and what it returns is the rest, for the caller to carry out (`scenes/interior.js`).
 *
 * @param {object} character
 * @param {object[]} bag
 * @param {string} id
 * @param {{reason?: string}} [ctx]  unused today; the seam a "you cannot drink here" rule
 *   would come through without changing this signature
 * @returns {{ok: boolean, reason?: string, character: object, bag: object[], note: string, effect: object|null}}
 */
export function useFromBag(character, bag, id, ctx = {}) {
  const item = itemById(id);
  const stock = stacks(bag);
  if (!item) return { ok: false, reason: `there is no ${id} to use`, character, bag: stock, note: '', effect: null };
  if (!countInBag(stock, item.id)) {
    return { ok: false, reason: `you are not carrying a ${item.name.toLowerCase()}`, character, bag: stock, note: '', effect: null };
  }
  if (item.kind === 'misc' && item.material) {
    return {
      ok: false,
      reason: `a bar of ${materialById(item.material).name.toLowerCase()} needs a smith, not a traveller`,
      character, bag: stock, note: '', effect: null,
    };
  }
  if (item.kind !== 'potion' && item.kind !== 'scroll') {
    return {
      ok: false,
      reason: `a ${item.name.toLowerCase()} is used by equipping it, not by drinking it`,
      character, bag: stock, note: '', effect: null,
    };
  }

  const effect = { ...item.effect };
  const next = { ...(character ?? {}) };
  let note = '';
  switch (effect.kind) {
    case 'heal': {
      const max = Number.isFinite(next.maxHealth) ? next.maxHealth : Infinity;
      const before = Number(next.health) || 0;
      next.health = Math.min(max, before + effect.power);
      note = next.health === before
        ? 'Nothing left to mend — you are whole.'
        : `The draught closes your wounds: ${next.health - before} health back.`;
      break;
    }
    case 'cure': {
      const afflictions = Array.isArray(next.afflictions) ? next.afflictions.filter((a) => a !== effect.element) : [];
      next.afflictions = afflictions;
      note = `The ${effect.element} is washed out of you.`;
      break;
    }
    case 'restorePower': {
      // **Potion of Restore Power**, UESP's own name for spell points back.
      const max = Number.isFinite(next.maxSpellPoints) ? next.maxSpellPoints : Infinity;
      const before = Number(next.spellPoints) || 0;
      next.spellPoints = Math.min(max, before + effect.power);
      note = `Power returns: ${next.spellPoints - before} spell points.`;
      break;
    }
    case 'stamina': {
      // The bar itself lives in the fight (`scenes/interior.js`'s `defence.stamina`), so the
      // dose is handed back in `effect.power` and the scene fills the bar — a pure module
      // has no business reaching into a scene's combat state.
      note = 'Your wind comes back.';
      break;
    }
    case 'purify': {
      // **UESP's own reading of Purification:** the Purify spell at level 16 — "heals 100
      // health points, cures poison, and gives Sanctuary". The dose the row carries is the
      // 100 health; Sanctuary is this project's ward, the same one `spells.js` gives the
      // spell (`ward 10`), and holds are broken because a Sanctuary is not a hold either.
      const max = Number.isFinite(next.maxHealth) ? next.maxHealth : Infinity;
      const before = Number(next.health) || 0;
      if (Number(effect.power) > 0) next.health = Math.min(max, before + Number(effect.power));
      next.afflictions = [];
      next.freeAction = true;
      next.ward = Math.max(0, Number(next.ward) || 0) + 10;
      note = `The draught scours you clean — ${(Number(next.health) || 0) - before} health back, poison and disease gone, a ward of ${next.ward}.`;
      break;
    }
    case 'freeAction': {
      next.freeAction = true;
      note = 'Nothing holds you now.';
      break;
    }
    case 'invisibility': {
      next.invisible = true;
      note = 'You fade from sight.';
      break;
    }
    case 'strength': {
      next.strengthBuff = Math.max(Number(next.strengthBuff) || 0, effect.power);
      note = `Your arm is heavier: +${effect.power} Strength.`;
      break;
    }
    case 'resist': {
      const resistances = { ...(next.resistances ?? {}) };
      resistances[effect.element] = Math.max(Number(resistances[effect.element]) || 0, effect.power);
      next.resistances = resistances;
      note = `You are hardened against ${effect.element}.`;
      break;
    }
    case 'shield': {
      next.ward = Math.max(0, Number(next.ward) || 0) + effect.power;
      note = `A ward settles over you — ${next.ward} points of it.`;
      break;
    }
    case 'light': {
      next.light = { radius: effect.power };
      note = 'Light blooms around you.';
      break;
    }
    case 'levitate': {
      next.levitating = true;
      note = 'Your feet leave the ground.';
      break;
    }
    case 'spell': {
      // The scroll's spell is *cast* by the caller, with all the casting rules
      // (`game/spells.js`): a scroll is a thing that lets a fighter cast what a mage casts.
      note = `${item.name} crumbles away — the words are in your mouth.`;
      break;
    }
    default:
      return { ok: false, reason: `${item.name} does nothing this game knows how to do`, character, bag: stock, note: '', effect: null };
  }
  return { ok: true, character: next, bag: removeFromBag(stock, item.id, 1), note, effect };
}

/**
 * Throw something away.
 *
 * @param {object[]} bag
 * @param {string} id
 * @returns {{bag: object[], dropped: object|null}} the dropped item's record, for a line
 */
export function dropFromBag(bag, id) {
  const item = itemById(id);
  if (!item || !countInBag(bag, item.id)) return { bag: stacks(bag), dropped: null };
  return { bag: removeFromBag(bag, item.id, 1), dropped: item };
}

/**
 * The suit's protection as the one number the character sheet prints.
 *
 * **UESP's rating, worn the way UESP says it is worn:** each piece is worth its material's
 * armour (leather 3, chain 6, plate 9 + the metal shift) over the area it covers, and this is
 * the weighted average across the body (`game/armour.js`). A bare character is 0, a full
 * leather suit 3, full chain 6, full plate 9, full ebony plate 14. Read *that* number as the
 * average; the fight asks `armourAt` for the area a blow actually struck.
 *
 * @param {object} character
 * @returns {number} 0…14
 */
export function armourRating(character) {
  return ratingOf(character, itemById);
}

/**
 * The protection one body area has, from what the character wears — what the fight's blow asks.
 *
 * @param {object} character
 * @param {string} area  one of `armour.js`'s `AREAS`
 * @returns {number}
 */
export function armourOn(character, area) {
  return armourAt(character, area, itemById);
}

/**
 * The whole coverage map, for the panel and for a probe that has to see which areas are bare.
 *
 * @param {object} character
 * @returns {{rating: number, areas: Record<string, number>, covered: string[]}}
 */
export function armourCoverage(character) {
  return coverageOf(character, itemById);
}

/**
 * The weapon the character is holding, with the material's bonus already in its range —
 * the same numbers the fight swings with and the bag's own note prints.
 *
 * @param {object} character
 * @returns {{item: object, material: object, min: number, max: number}}
 */
export function weaponHeld(character) {
  // **No weapon is the bare hand** — the fight's own default (`combat.js`'s `resolveAttack`), and
  // the state a new character is in until they equip the weapon in their pack. The old default
  // was a longsword, so an unarmed character was told they were swinging a sword they did not
  // have (and drew its sheet in first person, `interior.js`).
  const weapon = weaponById(character?.weapon ?? 'fists');
  const material = materialById(character?.material ?? 'steel');
  // `ITEMS` is built from `WEAPONS`, so every weapon the fight can swing is also catalogued and
  // the bare hand resolves to its own row. The old fallback was `ITEMS[0]` — whatever the catalog
  // happens to list first — which a player unarmed (as every new character begins, `startingKit`)
  // would read off the panel as somebody else's weapon.
  const item = itemById(weapon.id)
    ?? { id: weapon.id, name: weapon.name, kind: 'weapon', damage: { min: weapon.min, max: weapon.max }, price: 0, weight: 0 };
  return {
    item,
    material,
    // **The same arithmetic the fight does** (`combat.js`'s `resolveAttack`: the weapon's own
    // range plus the material's own two ends, floored at 1), so the panel cannot promise a
    // number the swing will not roll — a fist with an iron "edge" is 1–1 on both sides.
    min: Math.max(1, item.damage.min + material.min),
    max: Math.max(Math.max(1, item.damage.min + material.min), item.damage.max + material.max),
  };
}

/**
 * The weapon each class begins with, from UESP's own class table.
 *
 * "Warriors and their subclasses begin with a broadsword", the rogues' with a shortsword and the
 * mages' with a dagger (<https://en.uesp.net/wiki/Arena:Classes>, read 2026-10-16) — six classes
 * each, and the grouping is UESP's, not this project's.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const STARTING_WEAPON_OF_CLASS = Object.freeze({
  archer: 'broadsword', barbarian: 'broadsword', knight: 'broadsword',
  monk: 'broadsword', ranger: 'broadsword', warrior: 'broadsword',
  acrobat: 'shortsword', assassin: 'shortsword', bard: 'shortsword',
  burglar: 'shortsword', rogue: 'shortsword', thief: 'shortsword',
  battlemage: 'dagger', healer: 'dagger', mage: 'dagger',
  nightblade: 'dagger', sorceror: 'dagger', spellsword: 'dagger',
});

/**
 * A starting kit: what a character walks out of the Imperial Dungeons carrying.
 *
 * **The weapon is the class's, the armour and the draught are AUTHORED** — Arena gives a new
 * prisoner their class's weapon (UESP's table above: a Warrior a broadsword, a Thief a
 * shortsword, a Mage a dagger), a shirt or a robe, and 50–199 gold; the leather cuirass and the
 * healing draught stand in for the rest, and exist so the first shop has something to sell.
 *
 * **It is *carried*, not wielded.** In Arena the class weapon is in the pack and the player is
 * told to go into the inventory and **equip** it (UESP's Imperial Dungeons walkthrough), which is
 * why the equipment below says `weapon: 'fists'`: a new character's hands are empty until they
 * choose, and the first-person view shows the install's own `HAND.CIF` until they do. This
 * project handed every class a wielded dagger, which is half of the owner's report "in normal
 * arena your attack animation is fists and then when you equip different weapons it moves …
 * instead in perfectarena is always the dagger animation".
 *
 * @param {string|null} [classId]  the character's class, which decides the weapon
 * @returns {{bag: object[], equipment: {weapon: string, material: string, armour: object}}}
 */
export function startingKit(classId = null) {
  const weapon = STARTING_WEAPON_OF_CLASS[String(classId ?? '').toLowerCase()] ?? 'dagger';
  // **A bowman starts with a quiver.** The archer and the ranger begin holding a bow
  // (`STARTING_WEAPON_OF_CLASS`), and a bow with no arrows is a stick in this port now that a shot
  // spends one (`archery.js`, the owner's 2026-10-18 request).
  const quivered = addToBag(addToBag(createBag(), weapon, 1), 'potion-heal', 1);
  return {
    bag: ['short-bow', 'long-bow'].includes(weapon) ? addToBag(quivered, 'arrow', 20) : quivered,
    equipment: { weapon: 'fists', material: 'iron', armour: { cuirass: 'leather-cuirass' } },
  };
}
