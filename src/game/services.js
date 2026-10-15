// THE SERVICES A BUILDING OFFERS — TRADING, RESTING, THE SHRINE, THE GUILD'S SHELF.
//
// Arena's towns are a ring of doors, and behind each door is a trade: an **equipment store**
// that sells weapons and armour, a **tavern** that rents rooms and lets a player sleep, a
// **temple** that heals for a price, and a **Mages Guild** that sells spells and potions.
// `game/shops.js` already reads which door leads to which trade, straight out of the
// install's own `.MNU` `*MENU` table, and the keeper already speaks that trade's own bank
// (`equip.dat`, `tavern.dat`, `muguild.dat`). What was missing was the *trade itself*: a door
// that opened onto a shopkeeper with nothing to sell.
//
// This module is the trade, as pure functions: what is on a shelf, what a purchase does to a
// character's purse and bag, what a night's rest is worth, and what the shrine asks for its
// healing. Nothing here touches the DOM or a save file — the scene hands in a character and a
// bag and gets back the ones that result, plus a line for the notice bar (the same discipline
// as `game/items.js` and `game/spells.js`).
//
// ## What is the install's and what is ours
//
//   * **Which trade a building is**, and **which words its keeper uses**, are the install's
//     (`game/shops.js`, `arena/arenaText.js`).
//   * **Every item and spell on a shelf** is real: the items come from `game/items.js` —
//     Arena's own weapon table and the documented equipment vocabulary — and the spells are
//     the 64 named records of the install's own `SPELLSG.65`, read by `arena/spellsFile.js`.
//   * **The prices are AUTHORED**, because Arena's are inside `A.EXE` (DECISIONS.md D11):
//     `game/items.js`'s `priceOf` for goods, and `guildPrice` below for a spell, which is the
//     one place a spell's cost in *gold* is decided. `SERVICES_NOTE` says so in the game, and
//     it is the same sentence a shelf is stamped with.

import {
  ITEMS, addToBag, countInBag, itemById, itemsOfKind, priceOf, removeFromBag,
} from './items.js';
import { learnSpell, restore, spellsForSale } from './spells.js';
import { ArenaRandom } from './arenaRandom.js';

// ── the shelf's own stock, and the price that is talked down ─────────────────
//
// `shelfFor` answers *what a trade can put in front of a customer*; a shop answers *what
// its shelf holds today*. The two are made one by a **seeded stock**: each shop picks its
// rows from its trade's affordable pool by its own seed — the same shop, the same shelf,
// every visit — and each row carries a count, because a shelf is a volume of goods and not
// a menu of wishes. And a keeper *haggles*: three tries a visit, a win makes the price
// kinder, a loss makes it dearer — the same conversation a town's regard starts.
//
// What stays AUTHORED (the originals are inside `A.EXE`): how much a shelf is allowed to
// hold, the haggle's odds, and the restock-per-visit reading of `qty` — a shelf whose
// emptied rows are remembered across visits wants the shop ledger this build is not yet
// carrying, and PROGRESS.md's simplification list says so.

/** How many rows a shop's own shelf picks. */
export const STOCK_ROWS_MAX = 10;
/** The chances one row of a shelf holds more than one of its thing (1–3). */
export const STOCK_QTY_MAX = 3;
/** The chance a shelf carries one Great Find: the cheapest thing just past the budget. */
export const GREAT_FIND_CHANCE = 0.35;
/** How many haggle tries one visit buys. */
export const HAGGLE_MAX = 3;
/** The price factor a win buys (and a loss costs): a win is kinder with every prior try. */
export const HAGGLE_WIN_FACTOR = 0.85;
export const HAGGLE_WIN_DECAY = 0.05;
export const HAGGLE_LOSS_FACTOR = 1.05;

/**
 * A shop's own shelf: the trade's rows picked by seed, each with a count.
 *
 * Deliberately *not* a re-roll of `shelfFor`: the shelf is the budget shelf's pool, made a
 * *place's* shelf by its seed — the same keeper greets you with the same goods, but the
 * shop down the street holds a different selection. One row in three is a **Great Find**:
 * the cheapest thing just past a customer's level's budget, present for the visit you can
 * finally pay for it.
 *
 * @param {string} kind  a key of `SERVICE_KINDS`
 * @param {{level?: number, seed?: number}} [opts]
 * @returns {{items: {item: object, price: number, qty: number}[], greatFind: {item: object, price: number, qty: number}|null}}
 */
export function stockFor(kind, opts = {}) {
  const level = Math.max(1, Number(opts?.level) || 1);
  const budget = shelfBudget({ level });
  const pool = {
    equipment: [...itemsOfKind('weapon'), ...itemsOfKind('armour'), ...itemsOfKind('shield')],
    mages: [...itemsOfKind('potion'), ...itemsOfKind('scroll')],
    temple: itemsOfKind('potion').filter((item) => /cure|heal/i.test(item.id)),
    tavern: itemsOfKind('potion').filter((item) => !/cure|resist/i.test(item.id)),
  }[kind];
  if (!pool) return { items: [], greatFind: null };

  const affordable = pool.slice().sort((a, b) => a.price - b.price)
    .filter((item) => priceOf(item) <= budget);
  const past = pool.filter((item) => priceOf(item) > budget);
  const random = new ArenaRandom((Number(opts?.seed) >>> 0) || 1);

  const items = [];
  const taken = new Set();
  // A shelf walks its pool cheap-first, taking roughly every other candidate — a spread
  // that reads as a shop and not a warehouse, and whose *content* is the seed's alone.
  for (let i = 0; i < affordable.length && items.length < STOCK_ROWS_MAX; i++) {
    if (random.nextBelow(100) < 45) continue;
    const item = affordable[i];
    if (taken.has(item.id)) continue;
    taken.add(item.id);
    items.push({ item, price: priceOf(item), qty: 1 + random.nextBelow(STOCK_QTY_MAX) });
  }
  // The Great Find: the cheapest thing the level's budget keeps off every shelf yet, here
  // on the seeded roll's chance — a thing you saw rich travellers carrying.
  let greatFind = null;
  if (past.length && random.nextBelow(100) < GREAT_FIND_CHANCE * 100) {
    const item = past[0];
    greatFind = { item, price: priceOf(item), qty: 1 };
  }
  return { items, greatFind };
}

/**
 * One haggle try.
 *
 * The odds are the shopkeeper's regard (`game/regard.js`'s ledger, when a keeper has one)
 * laid over coin weight: sixty-four in a hundred to begin with, plus a tenth per ten regard
 * — and every try already spent this visit makes the next one dearer, because a keeper who
 * has said no twice is not going to say yes the third time out of patience.
 *
 * @param {{regard?: number, attempts?: number, random: object}} opts
 *   `random` is the caller's seeded `ArenaRandom` — the visit's own roll, not a fresh die.
 * @returns {{ok: boolean, factor: number, attempts: number, note: string}}
 *   `factor` multiplies the next price: kinder than one for a win, dearer for a loss, and
 *   exactly one when the keeper will hear no more of it.
 */
export function haggleRoll({ regard = 0, attempts = 0, random }) {
  const spent = Math.max(0, Math.min(HAGGLE_MAX, Math.round(Number(attempts) || 0)));
  if (spent >= HAGGLE_MAX) {
    return { ok: false, factor: 1, attempts: spent, note: 'The keeper will hear no more of it today.' };
  }
  const chance = 0.64 + Math.max(-50, Math.min(50, Number(regard) || 0)) / 1000;
  // The install's own `ArenaRandom` rolls a 16-bit die (`arenaRandom.js`), so a chance is
  // a share of the top of that die rather than a second kind of randomness.
  const die = random && typeof random.next === 'function' ? random.next() / 65536 : Math.random();
  const won = die < chance;
  if (won) {
    const factor = HAGGLE_WIN_FACTOR - HAGGLE_WIN_DECAY * spent;
    return {
      ok: true,
      factor,
      attempts: spent + 1,
      note: `The keeper softens: everything goes for ${Math.round((1 - factor) * 100)}% less the rest of the visit.`,
    };
  }
  const factor = HAGGLE_LOSS_FACTOR + 0.04 * spent;
  return {
    ok: false,
    factor,
    attempts: spent + 1,
    note: `The keeper hardens: ${Math.round((factor - 1) * 100)}% more a piece for the rest of the visit.`,
  };
}

/** Re-export the sentence a shop's shelf is stamped with, so a scene imports one place. */
export { SERVICES_NOTE } from './items.js';

/**
 * The trades a town's doors lead to, with what each one *is* in Arena's own taxonomy.
 *
 * The keys are `game/shops.js`'s `SHOP_KINDS`, unchanged: this is the same six trades the
 * `.MNU` table names, and a seventh would be a seventh door.
 */
export const SERVICE_KINDS = Object.freeze({
  equipment: { name: 'an equipment store', sells: 'goods', signs: 'a smith\'s sign' },
  tavern: { name: 'a tavern', sells: 'rooms', signs: 'a tavern sign' },
  mages: { name: 'the Mages Guild', sells: 'magic', signs: 'the guild\'s sigil' },
  temple: { name: 'a temple', sells: 'blessings', signs: 'a temple\'s sign' },
  house: { name: 'a house', sells: 'nothing', signs: 'no sign at all' },
  noble: { name: 'a noble house', sells: 'nothing', signs: 'a coat of arms' },
});

/** What a traveller may pay a temple for. */
export const TEMPLE_SERVICES = Object.freeze([
  { id: 'healing', label: 'healing at the shrine', note: 'as much health as the shrine can give' },
  { id: 'cure', label: 'a cure for what ails you', note: 'poison and disease washed away' },
  { id: 'blessing', label: 'a blessing on your road', note: 'a ward against what waits outside' },
]);

/** The sentence a shop's shelf carries about where its prices come from. */
export const PRICE_NOTE = 'Arena\'s own goods and spells; the prices are this project\'s, because the originals live in A.EXE.';

/**
 * What a shop of this kind will put in front of a customer of this level.
 *
 * A shelf is deliberately *level-appropriate*: a first-level character standing in a smithy
 * sees daggers and leather, and the claymore is on the shelf the day they can pay for it.
 * That is **AUTHORED** (Arena's own stock tables are in `A.EXE`), and it is what makes a shop
 * worth walking into twice.
 *
 * @param {string} kind  a key of `SERVICE_KINDS`
 * @param {{level?: number, library?: {spells: object[]}, character?: object}} [opts]
 * @returns {{items: {item: object, price: number}[], spells: {spell: object, price: number}[], services: {id: string, label: string, note: string, price: number}[]}}
 */
export function shelfFor(kind, opts = {}) {
  const character = opts.character ?? { level: 1 };
  const budget = shelfBudget(character);
  const empty = { items: [], spells: [], services: [] };
  if (!SERVICE_KINDS[kind] || SERVICE_KINDS[kind].sells === 'nothing') return empty;

  if (kind === 'equipment') {
    const goods = [...itemsOfKind('weapon'), ...itemsOfKind('armour'), ...itemsOfKind('shield')];
    return { ...empty, items: shelfRows(goods, budget, character) };
  }
  if (kind === 'mages') {
    const goods = [...itemsOfKind('potion'), ...itemsOfKind('scroll')];
    const spells = spellsForSale(opts.library?.spells ?? [], character)
      .filter((spell) => !isKnown(character, spell.name))
      .filter((spell) => guildPrice(character, spell) <= budget * 3)
      .map((spell) => ({ spell, price: guildPrice(character, spell) }));
    return { items: shelfRows(goods, budget, character), spells, services: [] };
  }
  if (kind === 'temple') {
    const goods = itemsOfKind('potion').filter((item) => /cure|heal/i.test(item.id));
    const services = TEMPLE_SERVICES.map((service) => ({ ...service, price: templePrice(character, service.id) }));
    return { items: shelfRows(goods, budget, character), spells: [], services };
  }
  if (kind === 'tavern') {
    const services = [{ id: 'rest', label: 'a room for the night', note: 'sleep until morning, whole again', price: restCost(character) }];
    const goods = itemsOfKind('potion').filter((item) => !/cure|resist/i.test(item.id));
    return { items: shelfRows(goods, budget, character), spells: [], services };
  }
  return empty;
}

/**
 * How much gold a customer of this level is expected to have, which is what a shelf is
 * filtered by. **AUTHORED**: forty coins to walk in with, and ninety more a level.
 *
 * @param {object} character
 * @returns {number}
 */
export function shelfBudget(character) {
  const level = Math.max(1, Number(character?.level) || 1);
  return 40 + level * 90;
}

/** The affordable rows of a list of goods, cheapest first, with a floor of four items. */
function shelfRows(goods, budget, character) {
  const sorted = goods.slice().sort((a, b) => a.price - b.price);
  const affordable = sorted.filter((item) => priceOf(item, { regard: regardFor(character) }) <= budget);
  const chosen = affordable.length >= 4 ? affordable : sorted.slice(0, 4);
  return chosen.map((item) => ({ item, price: priceOf(item, { regard: regardFor(character) }) }));
}

/** The shopkeeper's regard, if the caller put one on the character for this shop. */
function regardFor(character) {
  return Number.isFinite(character?.shopRegard) ? character.shopRegard : 0;
}

/** Does the character's book already hold this spell? */
function isKnown(character, name) {
  const list = Array.isArray(character?.knownSpells) ? character.knownSpells : [];
  return list.some((known) => String(known).toLowerCase() === String(name).toLowerCase());
}

/**
 * What the Mages Guild charges for a spell, in gold.
 *
 * The base is the spell's own cost in **spell points** — the one number in the record that is
 * Arena's — turned into coin and rounded up, and the discount is the Battlemage's and the
 * Nightblade's own ability ("spellmaker discounts", `game/character.js`). **AUTHORED.**
 *
 * @param {object} character
 * @param {{points?: number}} spell
 * @returns {number}
 */
export function guildPrice(character, spell) {
  const base = Math.max(0, Number(spell?.points) || 0);
  const classId = String(character?.classId ?? '').toLowerCase();
  const discount = classId === 'battlemage' || classId === 'nightblade' ? 0.9 : 1;
  return Math.max(5, Math.round((base * 1.2 + 50) * discount));
}

/**
 * What a temple asks for a service.
 *
 * Healing is priced against what is *wrong* with the customer — a whole customer pays the
 * minimum — and a cure or a blessing is a flat fee. **AUTHORED.**
 *
 * @param {object} character
 * @param {'healing'|'cure'|'blessing'} id
 * @returns {number}
 */
export function templePrice(character, id) {
  if (id === 'cure') return 25;
  if (id === 'blessing') return 60;
  const max = Number.isFinite(character?.maxHealth) ? character.maxHealth : Number(character?.health) || 0;
  const missing = Math.max(0, max - (Number(character?.health) || 0));
  return Math.max(5, Math.round(missing * 1.5));
}

/**
 * What a night in a tavern costs. **AUTHORED**: five coins and five a level, which is a price
 * a first-level adventurer can meet and a twentieth-level one does not think about.
 *
 * @param {object} character
 * @returns {number}
 */
export function restCost(character) {
  return 5 + 5 * Math.max(1, Number(character?.level) || 1);
}

/**
 * Buy something. One door for goods and for spells, because a purchase is one thing: the
 * purse goes down, the shelf's contents go to the customer, and the refusal says which.
 *
 * @param {object} character
 * @param {object[]} bag
 * @param {string} id
 * @param {{kind?: string, regard?: number, library?: object}} [opts]
 * @returns {{ok: boolean, reason?: string, character: object, bag: object[], note: string, cost: number, sold: object|null}}
 */
export function buyItem(character, bag, id, opts = {}) {
  const item = itemById(id);
  const stock = Array.isArray(bag) ? bag : [];
  if (!item) return { ok: false, reason: `no shop in Tamriel sells a ${id}`, character, bag: stock, note: '', cost: 0, sold: null };
  const cost = priceOf(item, { regard: Number.isFinite(opts.regard) ? opts.regard : regardFor(character) });
  const gold = Number(character?.gold) || 0;
  if (gold < cost) {
    return { ok: false, reason: `${item.name} costs ${cost} gold and you have ${gold}`, character, bag: stock, note: '', cost, sold: null };
  }
  return {
    ok: true,
    character: { ...character, gold: gold - cost },
    bag: addToBag(stock, item.id, 1),
    note: `${item.name} bought for ${cost} gold.`,
    cost,
    sold: item,
  };
}

/**
 * Sell something out of the bag.
 *
 * A shop sells its own trade and buys what its trade deals in: an equipment store buys
 * weapons, armour and shields, the Mages Guild buys potions and scrolls, and nobody buys a
 * bar of metal off a traveller. That rule is **AUTHORED** — Arena's own shops had a stock
 * system this build does not attempt — and it is what stops the game being a pawn shop.
 *
 * @param {object} character
 * @param {object[]} bag
 * @param {string} id
 * @param {{kind?: string, regard?: number}} [opts]
 * @returns {{ok: boolean, reason?: string, character: object, bag: object[], note: string, gold: number, sold: object|null}}
 */
export function sellItem(character, bag, id, opts = {}) {
  const item = itemById(id);
  const stock = Array.isArray(bag) ? bag : [];
  if (!item) return { ok: false, reason: `there is no ${id} to sell`, character, bag: stock, note: '', gold: 0, sold: null };
  if (!countInBag(stock, item.id)) return { ok: false, reason: `you are not carrying a ${item.name.toLowerCase()}`, character, bag: stock, note: '', gold: 0, sold: null };
  if (!buys(opts.kind, item.kind)) {
    return { ok: false, reason: `${SERVICE_KINDS[opts.kind]?.name ?? 'this shop'} does not deal in ${item.kind === 'misc' ? 'raw metal' : `${item.kind}s`}`, character, bag: stock, note: '', gold: 0, sold: null };
  }
  const gold = priceOf(item, { selling: true, regard: Number.isFinite(opts.regard) ? opts.regard : regardFor(character) });
  return {
    ok: true,
    character: { ...character, gold: (Number(character?.gold) || 0) + gold },
    bag: removeFromBag(stock, item.id, 1),
    note: `${item.name} sold for ${gold} gold.`,
    gold,
    sold: item,
  };
}

/** Does a trade deal in a kind of goods? */
export function buys(kind, itemKind) {
  if (kind === 'equipment') return ['weapon', 'armour', 'shield'].includes(itemKind);
  if (kind === 'mages') return ['potion', 'scroll', 'misc'].includes(itemKind);
  if (kind === 'temple') return ['potion'].includes(itemKind);
  if (kind === 'tavern') return ['potion'].includes(itemKind);
  return false;
}

/**
 * Buy a spell from the Mages Guild.
 *
 * @param {object} character
 * @param {{name: string, points?: number}} spell
 * @param {{regard?: number}} [opts]
 * @returns {{ok: boolean, reason?: string, character: object, note: string, cost: number}}
 */
export function buySpell(character, spell, opts = {}) {
  if (!spell?.name) return { ok: false, reason: 'there is no such spell', character, note: '', cost: 0 };
  if (isKnown(character, spell.name)) {
    return { ok: false, reason: `${spell.name} is already in your spellbook`, character, note: '', cost: 0 };
  }
  if (character?.spellPoints == null) {
    return {
      ok: false,
      reason: 'this class has no spell points — Arena\'s fighters do not cast, and the guild will not sell to you',
      character, note: '', cost: 0,
    };
  }
  const cost = guildPrice(character, spell);
  const gold = Number(character?.gold) || 0;
  if (gold < cost) {
    return { ok: false, reason: `${spell.name} costs ${cost} gold and you have ${gold}`, character, note: '', cost };
  }
  return {
    ok: true,
    character: { ...learnSpell(character, spell.name), gold: gold - cost },
    note: `${spell.name} learnt for ${cost} gold — the words will come when you call them.`,
    cost,
  };
}

/**
 * A night's rest, or a day's, in a tavern.
 *
 * The night costs gold, heals everything and hands back the spell points; it also **passes a
 * day**, which is what makes the calendar the same clock a job's deadline is measured on
 * (`game/radiantQuests.js`). Sleeping is therefore not a free heal, and the caller is the one
 * that owns the calendar: the returned `days` is what to advance it by.
 *
 * @param {object} character
 * @param {{kind?: string, regard?: number}} [opts]
 * @returns {{ok: boolean, reason?: string, character: object, note: string, cost: number, days: number}}
 */
export function rest(character, opts = {}) {
  const cost = restCost(character);
  const gold = Number(character?.gold) || 0;
  if (gold < cost) {
    return { ok: false, reason: `a room costs ${cost} gold and you have ${gold}`, character, note: '', cost, days: 0 };
  }
  const rested = restore({ ...character, gold: gold - cost });
  return {
    ok: true,
    character: rested,
    note: `You sleep until morning. ${cost} gold for the room; the wounds are gone and the spell points are back.`,
    cost,
    days: 1,
  };
}

/**
 * A temple's service.
 *
 * @param {object} character
 * @param {'healing'|'cure'|'blessing'} id
 * @param {{regard?: number}} [opts]
 * @returns {{ok: boolean, reason?: string, character: object, note: string, cost: number}}
 */
export function templeService(character, id, opts = {}) {
  const service = TEMPLE_SERVICES.find((entry) => entry.id === id);
  if (!service) return { ok: false, reason: `${id} is not a service a temple offers`, character, note: '', cost: 0 };
  const cost = templePrice(character, id);
  const gold = Number(character?.gold) || 0;
  if (gold < cost) {
    return { ok: false, reason: `${service.label} costs ${cost} gold and you have ${gold}`, character, note: '', cost };
  }
  const paid = { ...character, gold: gold - cost };
  if (id === 'healing') {
    const max = Number.isFinite(paid.maxHealth) ? paid.maxHealth : Number(paid.health) || 0;
    return { ok: true, character: { ...paid, health: max }, note: `The priest lays hands on you: ${cost} gold, and you are whole.`, cost };
  }
  if (id === 'cure') {
    return { ok: true, character: { ...paid, afflictions: [] }, note: `The cure is bitter and the priest is not gentle: ${cost} gold, and nothing is left in you.`, cost };
  }
  const ward = Math.max(0, Number(paid.ward) || 0) + 10;
  return { ok: true, character: { ...paid, ward }, note: `A blessing for the road: ${cost} gold, and a ward of ${ward} over you.`, cost };
}

/**
 * The kinds of goods a trade will buy, for a panel that has to say why a button is missing.
 *
 * @param {string} kind
 * @returns {string[]}
 */
export function buysWhat(kind) {
  return ['weapon', 'armour', 'shield', 'potion', 'scroll', 'misc'].filter((itemKind) => buys(kind, itemKind));
}

/**
 * The whole catalog, for a tool or a test that wants to walk it.
 * @returns {object[]}
 */
export function catalog() {
  return ITEMS.slice();
}
