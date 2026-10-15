// THE PACK, THE SHELF AND THE SHRINE.
//
// `game/items.js` and `game/services.js` are the two places a number decides whether the game
// works: the bag law (an item can be taken, equipped, drunk and sold, and **nothing is ever
// destroyed by accident**) and the trade (a purchase is gold out and goods in, or it is a
// refusal that says why). Both are pure, so both are tested here without a browser, and the
// two joins worth failing loudly about are held to the install's own data:
//
//   * every weapon id in the catalog **is** a weapon id `game/combat.js` knows, because
//     equipping sets `character.weapon` and the fight looks that id up;
//   * every spell a **scroll** names is a record in the install's own `SPELLSG.65`, which is
//     what makes a scroll a cast the game can perform rather than a sentence about one.
//
// Run:  node --test tests/unit/items.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { MATERIALS, WEAPONS, materialById, weaponById } from '../../src/game/combat.js';
import {
  ITEMS, ITEM_KINDS, SCROLL_SPELLS, addToBag, armourRating, bagRows, bagValue, countInBag,
  createBag, dropFromBag, equipFromBag, itemById, itemNote, itemsOfKind, priceOf, removeFromBag,
  startingKit, useFromBag, weaponHeld,
} from '../../src/game/items.js';
import { parseSpellsFile, spellByName } from '../../src/arena/spellsFile.js';
import {
  SERVICE_KINDS, TEMPLE_SERVICES, buys, buysWhat, buyItem, buySpell, guildPrice, rest,
  restCost, sellItem, shelfFor, templePrice, templeService,
} from '../../src/game/services.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

const character = (extra = {}) => ({
  name: 'Tester', classId: 'mage', level: 1, health: 40, maxHealth: 80,
  spellPoints: 200, maxSpellPoints: 200, gold: 1000, knownSpells: ['Light Heal'], ...extra,
});

// ── the catalog ───────────────────────────────────────────────────────────────

test('every weapon Arena documents is an item, under the same id the fight swings with', () => {
  for (const weapon of WEAPONS) {
    const item = itemById(weapon.id);
    assert.ok(item, `${weapon.id} is in the catalog`);
    assert.equal(item.kind, 'weapon');
    assert.equal(item.name, weapon.name);
    assert.deepEqual([item.damage.min, item.damage.max], [weapon.min, weapon.max], `${weapon.id} keeps its range`);
    assert.equal(item.hands, ['battle-axe', 'claymore', 'warhammer', 'dai-katana', 'long-bow', 'short-bow'].includes(weapon.id) ? 'two' : 'one');
  }
  // …and the join the other way: every weapon item is a weapon the fight knows.
  for (const item of itemsOfKind('weapon')) {
    assert.ok(WEAPONS.some((weapon) => weapon.id === item.id), `${item.id} is a real weapon base`);
  }
  assert.equal(weaponById(itemById('dai-katana').id).max, 21);
});

test('the catalog is unique, kinded, priced and says what each thing is for', () => {
  const ids = new Set();
  for (const item of ITEMS) {
    assert.ok(!ids.has(item.id), `${item.id} appears once`);
    ids.add(item.id);
    assert.ok(ITEM_KINDS.includes(item.kind), `${item.id} has a known kind (${item.kind})`);
    assert.ok(item.price > 0, `${item.id} costs something`);
    assert.ok(item.weight > 0, `${item.id} weighs something`);
  }
  assert.deepEqual(ITEM_KINDS, ['weapon', 'armour', 'shield', 'potion', 'scroll', 'misc']);
  for (const material of MATERIALS) {
    const bar = itemById(material.id);
    assert.ok(bar && bar.kind === 'misc', `${material.id} is a bar of metal`);
    assert.match(itemNote(bar), /smithing/);
  }
  assert.match(itemNote(itemById('longsword')), /2–16 damage/);
  assert.match(itemNote(itemById('leather-cuirass')), /2 armour/);
  assert.match(itemNote(itemById('potion-heal')), /heals 25 health/);
  assert.match(itemNote(itemById('scroll-fireball')), /Fireball/);
  // The shelves a shop draws from are sorted cheapest first, which is the order they are shown.
  const potions = itemsOfKind('potion');
  for (let i = 1; i < potions.length; i++) assert.ok(potions[i - 1].price <= potions[i].price);
});

test('every scroll names a spell the install really ships', async () => {
  const file = parseSpellsFile(await nodeSource(ARENA).getBytes('SPELLSG.65'));
  assert.ok(SCROLL_SPELLS.length >= 10, `${SCROLL_SPELLS.length} scrolls`);
  for (const name of SCROLL_SPELLS) {
    assert.ok(spellByName(file.records, name), `${name} is one of Arena's own spells`);
  }
  // A scroll of a spell the game cannot cast would be a scroll that does nothing.
  const scroll = itemById('scroll-fireball');
  assert.equal(scroll.effect.kind, 'spell');
  assert.equal(scroll.effect.spell, 'Fireball');
  assert.equal(spellByName(file.records, scroll.effect.spell).points, 325);
});

// ── prices ────────────────────────────────────────────────────────────────────

test('a shop pays less than it charges, and regard moves both', () => {
  const sword = itemById('longsword');
  const full = priceOf(sword);
  const paid = priceOf(sword, { selling: true });
  assert.ok(paid < full, `${paid} paid against ${full} charged`);
  assert.equal(paid, Math.round(full * 0.35));
  assert.ok(priceOf(sword, { regard: 30 }) < full, 'a shop that likes you charges less');
  assert.ok(priceOf(sword, { selling: true, regard: 30 }) > paid, 'and pays more');
  assert.equal(priceOf({ price: 0 }), 1, 'nothing is free');
  assert.equal(priceOf(null), 0);
  assert.equal(priceOf(sword, { regard: 500 }), priceOf(sword, { regard: 50 }), 'regard is clamped');
});

// ── the bag law ───────────────────────────────────────────────────────────────

test('the bag is never mutated in place: every operation hands back a new one', () => {
  const empty = createBag();
  const one = addToBag(empty, 'dagger');
  assert.deepEqual(empty, [], 'the bag handed in is untouched');
  const two = addToBag(one, 'dagger');
  assert.deepEqual(one, [{ id: 'dagger', qty: 1 }], 'and so is the one after it');
  assert.deepEqual(two, [{ id: 'dagger', qty: 2 }], 'the same thing stacks');
  const three = addToBag(two, 'potion-heal', 3);
  assert.equal(countInBag(three, 'potion-heal'), 3);
  assert.equal(countInBag(three, 'POTION-HEAL'), 3, 'an id is matched case-insensitively');
  const four = addToBag(three, 'dagger', 0);
  assert.equal(countInBag(four, 'dagger'), 2, 'asking for none adds none');
  const five = addToBag(three, 'not-a-thing');
  assert.equal(five.length, 2, 'an item the catalog does not have is not invented');
  assert.deepEqual(removeFromBag(three, 'dagger', 9), [{ id: 'potion-heal', qty: 3 }], 'taking more than is there takes what is there');
  assert.deepEqual(removeFromBag(three, 'potion-heal', 1), [{ id: 'dagger', qty: 2 }, { id: 'potion-heal', qty: 2 }]);
  assert.deepEqual(removeFromBag(three, 'nothing'), three, 'removing what is not there changes nothing');
  // A bag a save file mangled is tolerated rather than trusted.
  assert.equal(countInBag([null, { id: 'dagger' }, { id: 'dagger', qty: 0 }, { id: 'dagger', qty: 2 }], 'dagger'), 2);
  assert.deepEqual(createBag(), []);
});

test('the bag lists itself the way a shop does, and is worth what a shop would pay', () => {
  const bag = addToBag(addToBag(createBag(), 'potion-heal', 2), 'longsword');
  const rows = bagRows(bag);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, 'weapon', 'weapons come first');
  assert.equal(rows[1].qty, 2);
  assert.deepEqual(rows.map((row) => row.index), [0, 1], 'rows are numbered for a UI');
  assert.equal(bagRows(addToBag(createBag(), 'not-a-thing')).length, 0);
  // A quarterstaff of a bag is worth the sum of what a shop would pay for its contents.
  const single = addToBag(createBag(), 'longsword');
  assert.equal(bagValue(single), priceOf(itemById('longsword'), { selling: true }));
  assert.equal(bagValue(createBag()), 0);
});

test('equipping puts a weapon in the hand, keeps it in the bag, and refuses nonsense', () => {
  const bag = addToBag(addToBag(createBag(), 'dagger'), 'potion-heal');
  const armed = equipFromBag(character(), bag, 'dagger');
  assert.equal(armed.ok, true, armed.reason);
  assert.equal(armed.character.weapon, 'dagger');
  assert.equal(countInBag(armed.bag, 'dagger'), 1, 'it is still yours');
  assert.match(armed.note, /dagger/i);

  const shielded = equipFromBag(character(), addToBag(bag, 'kite-shield'), 'kite-shield');
  assert.equal(shielded.character.shield, 'kite-shield');

  const armoured = equipFromBag(character(), addToBag(bag, 'plate-cuirass'), 'plate-cuirass');
  assert.equal(armoured.character.armour.cuirass, 'plate-cuirass');
  assert.equal(armoured.character.armour.helm, undefined, 'and nothing else is invented');

  const potion = equipFromBag(character(), bag, 'potion-heal');
  assert.equal(potion.ok, false);
  assert.match(potion.reason, /not something you wear or swing/);

  const missing = equipFromBag(character(), bag, 'claymore');
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /not carrying/);
  assert.equal(equipFromBag(character(), bag, 'nothing-at-all').ok, false);
});

test('using a potion heals and is spent; a scroll survives as the spell it will cast', () => {
  const wounded = character({ health: 10 });
  const bag = addToBag(addToBag(createBag(), 'potion-heal', 2), 'scroll-open');
  const drunk = useFromBag(wounded, bag, 'potion-heal');
  assert.equal(drunk.ok, true, drunk.reason);
  assert.equal(drunk.character.health, 35, '25 health back');
  assert.equal(drunk.effect.kind, 'heal');
  assert.equal(countInBag(drunk.bag, 'potion-heal'), 1, 'one off the stack');

  const capped = useFromBag(character({ health: 75 }), bag, 'potion-heal');
  assert.equal(capped.character.health, 80, 'never past the ceiling');

  const read = useFromBag(character(), bag, 'scroll-open');
  assert.equal(read.ok, true, read.reason);
  assert.deepEqual(read.effect, { kind: 'spell', power: 1, spell: 'Open' }, 'a scroll hands the caster a spell');
  assert.equal(countInBag(read.bag, 'scroll-open'), 0, 'and is spent doing it');
  assert.match(read.note, /Open/);

  const bar = useFromBag(character(), addToBag(bag, 'steel'), 'steel');
  assert.equal(bar.ok, false);
  assert.match(bar.reason, /smith/);

  const sword = useFromBag(character(), bag, 'dagger');
  assert.equal(sword.ok, false);

  const cure = useFromBag(character({ afflictions: ['poison', 'disease'] }), addToBag(bag, 'potion-cure-poison'), 'potion-cure-poison');
  assert.deepEqual(cure.character.afflictions, ['disease']);
  const resist = useFromBag(character(), addToBag(bag, 'potion-resist-fire'), 'potion-resist-fire');
  assert.equal(resist.character.resistances.fire, 3);
  const ward = useFromBag(character(), addToBag(bag, 'potion-shield'), 'potion-shield');
  assert.equal(ward.character.ward, 10);
});

test('dropping a thing takes it out of the bag and says what it was', () => {
  const bag = addToBag(createBag(), 'longsword', 2);
  const first = dropFromBag(bag, 'longsword');
  assert.equal(first.dropped.name, 'Longsword');
  assert.equal(countInBag(first.bag, 'longsword'), 1);
  const none = dropFromBag(first.bag, 'potion-heal');
  assert.equal(none.dropped, null);
  assert.deepEqual(none.bag, first.bag);
});

test('worn armour and a held shield add up, and the weapon in hand carries its material', () => {
  const dressed = character({ armour: { cuirass: 'plate-cuirass', helm: 'chain-helm' }, shield: 'buckler' });
  // plate cuirass 3 × 2 = 6, chain helm 2, a buckler 1.
  assert.equal(armourRating(dressed), 9);
  assert.equal(armourRating(character()), 0);
  assert.equal(armourRating(character({ armour: { cuirass: 'not-a-thing' } })), 0, 'a save file cannot add armour out of thin air');
  const steel = weaponHeld({ weapon: 'longsword', material: 'steel' });
  assert.deepEqual([steel.min, steel.max], [2, 16]);
  const iron = weaponHeld({ weapon: 'longsword', material: 'iron' });
  assert.deepEqual([iron.min, iron.max], [1, 15], 'iron is −1');
  assert.equal(weaponHeld({}).item.id, 'longsword', 'the default arm');
});

test('a new character walks out with a dagger, a leather cuirass and a draught', () => {
  const kit = startingKit();
  assert.equal(countInBag(kit.bag, 'dagger'), 1);
  assert.equal(countInBag(kit.bag, 'potion-heal'), 1);
  assert.equal(kit.equipment.weapon, 'dagger');
  assert.equal(kit.equipment.material, 'iron');
  assert.equal(kit.equipment.armour.cuirass, 'leather-cuirass');
  // …and every piece of it is real, which is the point of a starting kit.
  for (const stack of kit.bag) assert.ok(itemById(stack.id), stack.id);
  for (const id of Object.values(kit.equipment.armour)) assert.ok(itemById(id), id);
  assert.ok(itemById(kit.equipment.weapon));
});

// ── the services ──────────────────────────────────────────────────────────────

test('a shelf is what the trade sells, priced for the customer in front of it', () => {
  const equipment = shelfFor('equipment', { character: character({ level: 1 }) });
  assert.ok(equipment.items.length >= 4, `${equipment.items.length} things on the smith's shelf`);
  assert.ok(equipment.items.every((row) => itemById(row.item.id)), 'and every one of them is in the catalog');
  assert.ok(equipment.items.every((row) => row.price <= 130 + 1), 'a first-level shelf is a first-level shelf');
  assert.deepEqual(equipment.spells, [], 'a smith sells no spells');
  assert.deepEqual(equipment.services, []);

  // A high-level customer is shown the good stuff, which is what makes a shop worth returning to.
  const rich = shelfFor('equipment', { character: character({ level: 20 }) }).items;
  assert.ok(Math.max(...rich.map((row) => row.item.price)) > Math.max(...equipment.items.map((row) => row.item.price)),
    'the shelf grows with the customer');

  const guild = shelfFor('mages', { character: character(), library: { spells: [] } });
  assert.ok(guild.items.every((row) => ['potion', 'scroll'].includes(row.item.kind)), 'the guild sells magic');
  const temple = shelfFor('temple', { character: character() });
  assert.deepEqual(temple.services.map((service) => service.id), TEMPLE_SERVICES.map((service) => service.id));
  assert.ok(temple.items.every((row) => /cure|heal/i.test(row.item.id)));
  const tavern = shelfFor('tavern', { character: character() });
  assert.deepEqual(tavern.services.map((service) => service.id), ['rest']);
  assert.equal(tavern.services[0].price, restCost(character()));
  // A house is somebody's home: it sells nothing at all.
  for (const kind of ['house', 'noble']) {
    const shelf = shelfFor(kind, { character: character() });
    assert.deepEqual(shelf, { items: [], spells: [], services: [] }, `${kind} sells nothing`);
  }
  assert.deepEqual(shelfFor('not-a-trade', { character: character() }), { items: [], spells: [], services: [] });
  assert.equal(SERVICE_KINDS.equipment.sells, 'goods');
  assert.deepEqual(buysWhat('equipment'), ['weapon', 'armour', 'shield']);
  assert.equal(buys('mages', 'scroll'), true);
  assert.equal(buys('temple', 'weapon'), false);
});

test('buying and selling move gold and goods the way a shop does', () => {
  const poor = character({ gold: 3 });
  const refused = buyItem(poor, createBag(), 'longsword', { kind: 'equipment' });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /costs \d+ gold and you have 3/);
  assert.equal(refused.character.gold, 3, 'a refused purchase changes nothing');

  const bought = buyItem(character(), createBag(), 'buckler', { kind: 'equipment' });
  assert.equal(bought.ok, true, bought.reason);
  assert.equal(bought.cost, 45);
  assert.equal(bought.character.gold, 955);
  assert.equal(countInBag(bought.bag, 'buckler'), 1);

  const sold = sellItem(bought.character, bought.bag, 'buckler', { kind: 'equipment' });
  assert.equal(sold.ok, true, sold.reason);
  assert.equal(sold.gold, priceOf(itemById('buckler'), { selling: true }));
  assert.equal(sold.character.gold, 955 + sold.gold);
  assert.equal(countInBag(sold.bag, 'buckler'), 0);

  // A shop sells its own trade and buys its own trade, and says which when it does not.
  const guild = sellItem(character(), addToBag(createBag(), 'longsword'), 'longsword', { kind: 'mages' });
  assert.equal(guild.ok, false);
  assert.match(guild.reason, /does not deal in weapons/);
  const notCarried = sellItem(character(), createBag(), 'longsword', { kind: 'equipment' });
  assert.equal(notCarried.ok, false);
  assert.match(notCarried.reason, /not carrying/);
  const nothing = buyItem(character(), createBag(), 'a-fish', { kind: 'equipment' });
  assert.equal(nothing.ok, false);
  assert.match(nothing.reason, /no shop in Tamriel/);
});

test('the guild sells spells by the install\'s own price in spell points', () => {
  const fireball = { name: 'Fireball', points: 325 };
  assert.equal(guildPrice(character(), fireball), 440);
  assert.equal(guildPrice(character({ classId: 'battlemage' }), fireball), 396, 'the Battlemage pays less');
  const learnt = buySpell(character(), fireball);
  assert.equal(learnt.ok, true, learnt.reason);
  assert.equal(learnt.cost, 440);
  assert.equal(learnt.character.gold, 560);
  assert.ok(learnt.character.knownSpells.includes('Fireball'));
  assert.match(learnt.note, /learnt/);

  const again = buySpell(learnt.character, fireball);
  assert.equal(again.ok, false);
  assert.match(again.reason, /already in your spellbook/);

  const warrior = buySpell(character({ classId: 'warrior', spellPoints: null }), fireball);
  assert.equal(warrior.ok, false);
  assert.match(warrior.reason, /no spell points/);

  const broke = buySpell(character({ gold: 1 }), fireball);
  assert.equal(broke.ok, false);
  assert.match(broke.reason, /costs 440 gold/);
});

test('a night in a tavern heals, restores spell points, costs gold and passes a day', () => {
  const tired = character({ level: 3, gold: 50, health: 5, spellPoints: 0, afflictions: ['poison'] });
  const night = rest(tired);
  assert.equal(night.ok, true, night.reason);
  assert.equal(night.cost, 20, 'five coins and five a level');
  assert.equal(night.character.gold, 30);
  assert.equal(night.character.health, 80);
  assert.equal(night.character.spellPoints, 200);
  assert.deepEqual(night.character.afflictions, []);
  assert.equal(night.days, 1, 'the calendar moves, which is what a deadline is measured in');
  const broke = rest(character({ gold: 0 }));
  assert.equal(broke.ok, false);
  assert.match(broke.reason, /and you have 0/);
  assert.equal(broke.days, 0);
});

test('a temple heals for what is wrong with you, and a blessing is a ward', () => {
  const hurt = character({ health: 10, maxHealth: 50, gold: 200 });
  assert.equal(templePrice(hurt, 'healing'), 60, 'forty points of damage, at a coin and a half');
  const healed = templeService(hurt, 'healing');
  assert.equal(healed.ok, true, healed.reason);
  assert.equal(healed.character.health, 50);
  assert.equal(healed.character.gold, 140);
  assert.equal(templePrice(character({ health: 80, maxHealth: 80 }), 'healing'), 5, 'a whole customer pays the minimum');

  const cured = templeService(character({ afflictions: ['poison'], gold: 100 }), 'cure');
  assert.deepEqual(cured.character.afflictions, []);
  assert.equal(cured.character.gold, 75);

  const blessed = templeService(character({ gold: 100 }), 'blessing');
  assert.equal(blessed.character.ward, 10);
  assert.equal(blessed.cost, 60);

  const broke = templeService(character({ gold: 1 }), 'blessing');
  assert.equal(broke.ok, false);
  assert.match(broke.reason, /costs 60 gold/);
  const unknown = templeService(character(), 'not-a-service');
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /not a service/);
});

test('the material a weapon is made of is a thing the game can name', () => {
  assert.equal(materialById('ebony').damage, 5);
  const ebony = weaponHeld({ weapon: 'katana', material: 'ebony' });
  assert.deepEqual([ebony.min, ebony.max], [8, 21], '3–16 with an ebony edge');
});
