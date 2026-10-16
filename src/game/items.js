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
//   * **Everything else is AUTHORED** — prices, weights, armour values, which pieces exist,
//     the potion and scroll lists, and what a potion's dose is worth. Arena's own item names
//     and price table are in `A.EXE` (D11), exactly as `game/dungeonItems.js`'s loot values
//     and `game/radiantQuests.js`'s `ITEMS` list already are; the vocabulary is Arena's
//     documented equipment (leather/chain/plate, the shield types, the potions the Mages
//     Guild sells), and the numbers are this project's, labelled as such here and printed as
//     such by the shop line (`SERVICES_NOTE`). Logged as S34 in PROGRESS.md.
//
// ## The bag
//
// A bag is an array of stacks, `[{ id, qty }]`, and **every function here returns a new
// array** — nothing mutates the bag it is given, so the scene can hold the old one until it
// has decided the operation succeeded, and a save is always a consistent bag.
//
//   `character.weapon`   the weapon base id (with `character.material` beside it)
//   `character.shield`   the shield's item id
//   `character.armour`   `{ cuirass, helm, greaves, boots }` of item ids
//
// Worn and held things **stay in the bag**: a player who equips a better longsword has not
// thrown the old one away, and an item that vanished when it was equipped would be an item
// the player could not sell. Nothing here ever destroys a piece of equipment; only a potion
// and a scroll are spent, because they are consumed.

import { MATERIALS, WEAPONS, materialById, weaponById } from './combat.js';

/** The kinds an item can be. The order is the order a bag is listed in. */
export const ITEM_KINDS = Object.freeze(['weapon', 'armour', 'shield', 'potion', 'scroll', 'misc']);

/** Kind → its place in `ITEM_KINDS`, for sorting a bag the way a shop lists one. */
const KIND_ORDER = Object.freeze(Object.fromEntries(ITEM_KINDS.map((kind, index) => [kind, index])));

/**
 * The sentence the game prints beside a shop's prices.
 *
 * A player is entitled to know which numbers are Arena's and which are this project's, and
 * this is the same discipline as `HIT_FORMULA_NOTE` in `combat.js`: the vocabulary is the
 * install's, the prices are ours because the originals are inside `A.EXE`.
 */
export const SERVICES_NOTE = 'Arena\'s own equipment and spell names; the prices, weights and '
  + 'armour values are this project\'s, because the originals live in A.EXE.';

/**
 * Weapons this project treats as two-handed, by Arena's own weapon list.
 *
 * UESP's weapon reference gives each base's hands for the later games and not for Arena; the
 * bows, the great blades and the warhammer are the ones no illustration of Arena shows with a
 * shield, which is the whole of the reasoning, and it is AUTHORED.
 */
const TWO_HANDED = Object.freeze(['battle-axe', 'claymore', 'warhammer', 'dai-katana', 'long-bow', 'short-bow']);

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

/** AUTHORED: what a bar of each metal costs, from the modifier it gives a weapon. */
const MATERIAL_PRICE = Object.freeze({
  iron: 30, steel: 85, silver: 110, elven: 140, dwarven: 195, mithril: 250, adamantium: 305, ebony: 360,
});

/** AUTHORED: the three body-armour materials, in Arena's own leather/chain/plate order. */
const ARMOUR_MATERIALS = Object.freeze([
  { material: 'leather', name: 'Leather', armour: 1, price: 14, weight: 6 },
  { material: 'chain', name: 'Chain', armour: 2, price: 42, weight: 9 },
  { material: 'plate', name: 'Plate', armour: 3, price: 115, weight: 15 },
]);

/**
 * AUTHORED: the four pieces armour comes in, and what each is worth as armour.
 *
 * A cuirass covers twice what a helm does; the numbers are this project's, and they are
 * deliberately small because the engine's armour class is small (`armourClass` is one point
 * per five points of Agility, so a character's whole AC is in the tens).
 */
const ARMOUR_PIECES = Object.freeze([
  { piece: 'cuirass', name: 'Cuirass', armour: 2, factor: 2.4, weight: 1 },
  { piece: 'helm', name: 'Helm', armour: 1, factor: 1, weight: 0.6 },
  { piece: 'greaves', name: 'Greaves', armour: 1, factor: 1.2, weight: 0.8 },
  { piece: 'boots', name: 'Boots', armour: 1, factor: 0.9, weight: 0.5 },
]);

/** AUTHORED: the shield types, their armour and their prices. */
const SHIELD_ROWS = Object.freeze([
  { id: 'buckler', name: 'Buckler', armour: 1, price: 45, weight: 4 },
  { id: 'round-shield', name: 'Round Shield', armour: 2, price: 90, weight: 6 },
  { id: 'kite-shield', name: 'Kite Shield', armour: 3, price: 180, weight: 9 },
  { id: 'tower-shield', name: 'Tower Shield', armour: 4, price: 340, weight: 14 },
]);

/**
 * AUTHORED: the potions a Mages Guild or an apothecary sells.
 *
 * Each one's `effect` is one of the kinds `useFromBag` applies (`heal`, `cure`, `resist`,
 * `shield`, `light`, `levitate`), and the potion's own name is the vocabulary Arena's
 * alchemy uses — a potion of cure poison is a potion of cure poison in any Elder Scrolls
 * game. The dose (`power`) is this project's.
 */
const POTION_ROWS = Object.freeze([
  { id: 'potion-heal', name: 'Potion of Healing', power: 25, price: 40, weight: 0.5, effect: { kind: 'heal' } },
  { id: 'potion-heal-great', name: 'Potion of Greater Healing', power: 60, price: 110, weight: 0.5, effect: { kind: 'heal' } },
  { id: 'potion-cure-poison', name: 'Potion of Cure Poison', power: 1, price: 60, weight: 0.5, effect: { kind: 'cure', element: 'poison' } },
  { id: 'potion-cure-disease', name: 'Potion of Cure Disease', power: 1, price: 75, weight: 0.5, effect: { kind: 'cure', element: 'disease' } },
  { id: 'potion-resist-fire', name: 'Potion of Resist Fire', power: 3, price: 60, weight: 0.5, effect: { kind: 'resist', element: 'fire' } },
  { id: 'potion-resist-cold', name: 'Potion of Resist Cold', power: 3, price: 60, weight: 0.5, effect: { kind: 'resist', element: 'cold' } },
  { id: 'potion-resist-shock', name: 'Potion of Resist Shock', power: 3, price: 60, weight: 0.5, effect: { kind: 'resist', element: 'shock' } },
  { id: 'potion-resist-poison', name: 'Potion of Resist Poison', power: 3, price: 90, weight: 0.5, effect: { kind: 'resist', element: 'poison' } },
  { id: 'potion-shield', name: 'Potion of Shielding', power: 10, price: 95, weight: 0.5, effect: { kind: 'shield' } },
  { id: 'potion-light', name: 'Potion of Light', power: 8, price: 50, weight: 0.5, effect: { kind: 'light' } },
  { id: 'potion-levitate', name: 'Potion of Levitation', power: 1, price: 120, weight: 0.5, effect: { kind: 'levitate' } },
  // Arena's own name for it; `water` is not an element a spell resists, so it is read as a
  // resistance to *drowning* by the scene and by nothing else.
  { id: 'potion-water-breathing', name: 'Potion of Water Breathing', power: 4, price: 70, weight: 0.5, effect: { kind: 'resist', element: 'water' } },
]);

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
]);

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
 *   damage?: {min: number, max: number}, hands?: string, armour?: number, slot?: string,
 *   material?: string, effect?: {kind: string, power: number, element?: string, spell?: string}}>}
 */
export const ITEMS = Object.freeze([
  ...WEAPONS.map((weapon) => Object.freeze({
    id: weapon.id,
    kind: 'weapon',
    name: weapon.name,
    price: weaponPrice(weapon),
    weight: Math.max(1, Math.round((weapon.min + weapon.max) / 6)),
    damage: Object.freeze({ min: weapon.min, max: weapon.max }),
    hands: TWO_HANDED.includes(weapon.id) ? 'two' : 'one',
  })),
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
  ...ARMOUR_MATERIALS.flatMap((row) => ARMOUR_PIECES.map((piece) => Object.freeze({
    id: `${row.material}-${piece.piece}`,
    kind: 'armour',
    name: `${row.name} ${piece.name}`,
    slot: piece.piece,
    material: row.material,
    armour: row.armour * piece.armour,
    price: Math.max(5, Math.round(row.price * piece.factor)),
    weight: Math.max(1, Math.round(row.weight * piece.weight)),
  }))),
  ...SHIELD_ROWS.map((row) => Object.freeze({
    id: row.id, kind: 'shield', name: row.name, armour: row.armour, price: row.price, weight: row.weight,
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

/**
 * One item from the catalog.
 *
 * @param {string} id
 * @returns {object|null} the item, or null when nothing in the catalog has that id
 */
export function itemById(id) {
  return id == null ? null : (BY_ID.get(String(id).toLowerCase()) ?? null);
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
  if (item.kind === 'weapon') return `${item.damage.min}–${item.damage.max} damage${item.hands === 'two' ? ', two-handed' : ''}`;
  if (item.kind === 'armour') return `${item.armour} armour (${item.slot})`;
  if (item.kind === 'shield') return `${item.armour} armour, held`;
  if (item.kind === 'misc' && item.material) {
    const material = materialById(item.material);
    const sign = material.damage >= 0 ? '+' : '';
    return `smithing: ${sign}${material.damage} damage, ${sign}${material.hit} to hit`;
  }
  if (item.effect?.kind === 'heal') return `heals ${item.effect.power} health`;
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
  if (item.kind === 'weapon') {
    const material = materialById(character?.material ?? 'steel');
    const min = Math.max(1, item.damage.min + material.damage);
    const max = Math.max(1, item.damage.max + material.damage);
    return {
      ok: true,
      character: { ...character, weapon: item.id },
      bag: stacks(bag),
      note: `${item.name} in hand — ${min}–${max} damage with a ${material.name.toLowerCase()} edge.`,
    };
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
 * What the character's worn armour and held shield are worth as armour class.
 *
 * The engine's own scale is Agility (`combat.js`'s `armourClass`), which is small; this adds
 * the worn pieces on top of it, which is what makes a plate cuirass worth buying. **AUTHORED**
 * like every other armour number here.
 *
 * @param {object} character
 * @returns {number}
 */
export function armourRating(character) {
  let total = 0;
  for (const id of Object.values(character?.armour ?? {})) {
    const item = itemById(id);
    if (item?.armour) total += item.armour;
  }
  const shield = itemById(character?.shield ?? '');
  if (shield?.armour) total += shield.armour;
  return total;
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
    // range plus the material's modifier, floored at 1), so the panel cannot promise a number the
    // swing will not roll — a fist with an iron "edge" is 1–1 on both sides.
    min: Math.max(1, item.damage.min + material.damage),
    max: Math.max(1, item.damage.max + material.damage),
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
  return {
    bag: addToBag(addToBag(createBag(), weapon, 1), 'potion-heal', 1),
    equipment: { weapon: 'fists', material: 'iron', armour: { cuirass: 'leather-cuirass' } },
  };
}
