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
import { weaponCarried } from '../../src/game/inventory.js';
import {
  ITEMS, ITEM_KINDS, SCROLL_SPELLS, addToBag, armourOn, armourRating, bagRows, bagValue,
  carriedWeight, carryStatus, countInBag, createBag, dropFromBag, equipFromBag, itemById, itemNote,
  itemsOfKind, maxCarryWeight, priceOf, removeFromBag, STARTING_WEAPON_OF_CLASS, startingKit,
  useFromBag, weaponHeld,
} from '../../src/game/items.js';
import { parseSpellsFile, spellByName } from '../../src/arena/spellsFile.js';
import { buildSpellLibrary } from '../../src/game/spells.js';
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
  // …and the join the other way: **every weapon item names a base the fight knows.** A catalog
  // row is either a plain base (`id`, the shape `character.weapon` and a save carry) or a
  // weapon in a material (`weapon` + `material`, the shape a shelf carries) — and both resolve
  // through `weaponById`, which is the join that makes equipping out of the bag need no
  // translation layer. This used to demand `id` alone, which is why an Ebony Longsword could not
  // exist in the catalog at all.
  for (const item of itemsOfKind('weapon')) {
    const base = item.weapon ?? item.id;
    assert.ok(WEAPONS.some((weapon) => weapon.id === base), `${item.id} names a real weapon base (${base})`);
    const named = item.material ? `${materialById(item.material).name} ${weaponById(base).name}` : weaponById(base).name;
    assert.equal(item.name, named, item.id);
  }
  assert.equal(weaponById(itemById('dai-katana').id).max, 21);
});

test('every weapon is listed in every material Arena makes it of, and one equip sets both', () => {
  // The owner, 2026-10-17: *"import all armors weapons and magic from og arena"*. Arena's
  // weapons are a base crossed with the metal — that is what `MATERIALS` is — so a smith's
  // shelf has to be able to show an Ebony Longsword, and the base rows have to keep working
  // beside them (a save, the class kit and the fight all carry `character.weapon`).
  // UESP's base table has **four** bodily rows: the punch and three gauntlets. The fourth
  // (`leather-gauntlets`, 2–3) was the one the port had left out.
  const bodily = ['fists', 'leather-gauntlets', 'chain-gauntlets', 'plate-gauntlets'];
  const craftable = WEAPONS.filter((weapon) => !bodily.includes(weapon.id));
  const forged = itemsOfKind('weapon').filter((item) => item.weapon);
  assert.equal(forged.length, craftable.length * MATERIALS.length,
    `${forged.length} forged weapons for ${craftable.length} bases × ${MATERIALS.length} materials`);
  for (const weapon of craftable) {
    for (const material of MATERIALS) {
      const item = itemById(`${material.id}-${weapon.id}`);
      assert.ok(item, `${material.id}-${weapon.id} is on the shelf`);
      assert.equal(item.kind, 'weapon');
      assert.equal(item.weapon, weapon.id);
      assert.equal(item.material, material.id);
      assert.equal(item.name, `${material.name} ${weapon.name}`);
      // The **base's** range, so exactly one material modifier is ever added (`weaponHeld`).
      assert.deepEqual([item.damage.min, item.damage.max], [weapon.min, weapon.max], item.id);
      assert.equal(item.hands, ['battle-axe', 'claymore', 'warhammer', 'dai-katana', 'long-bow', 'short-bow'].includes(weapon.id) ? 'two' : 'one');
      assert.ok(item.price > 0 && item.weight > 0, item.id);
    }
  }
  // **The shelf's ladder is the metals' own order** — the real teeth of the pricing rule, and
  // the one thing a reader of a shop's list can see: an iron blade is cheaper than a plain one,
  // silver costs the same as steel, and every rarer metal costs more than the last.
  const ladder = ['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony']
    .map((material) => itemById(`${material}-longsword`).price);
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i - 1] <= ladder[i], `prices climb with the metal: ${ladder.join(', ')}`);
  }
  assert.ok(ladder[0] < itemById('longsword').price, `an iron longsword is cheaper than a plain one (${ladder[0]})`);
  // A fist is not made of ebony, and the catalog does not pretend otherwise.
  for (const weapon of bodily) assert.equal(itemById(`ebony-${weapon}`), null, weapon);

  // **Equipping one sets both halves.** The plain base leaves the metal alone, and the forged
  // row *is* its metal — otherwise an ebony longsword would be swung with yesterday's steel
  // edge, and the panel would print the wrong range.
  const bag = addToBag(createBag(), 'ebony-longsword');
  const armed = equipFromBag(character({ weapon: 'dagger', material: 'iron' }), bag, 'ebony-longsword');
  assert.equal(armed.ok, true, armed.reason);
  assert.equal(armed.character.weapon, 'longsword');
  assert.equal(armed.character.material, 'ebony');
  assert.equal(countInBag(armed.bag, 'ebony-longsword'), 1, 'and it is still yours');
  const held = weaponHeld(armed.character);
  assert.deepEqual([held.min, held.max], [7, 21], '2–16 with an ebony edge');
  assert.match(itemNote(itemById('ebony-longsword')), /7–21 damage/, 'and the shelf says so');
  assert.match(itemNote(itemById('iron-longsword')), /2–14 damage/, 'iron is 0 on the low end and −2 on the high');
  const plain = equipFromBag(character({ weapon: 'dagger', material: 'iron' }), addToBag(bag, 'longsword'), 'longsword');
  assert.equal(plain.character.weapon, 'longsword', 'a plain base is still a weapon');
  assert.equal(plain.character.material, 'iron', 'and leaves the metal the player chose alone');
});

test('all of Arena\'s armour and every shield is in the catalog — seven pieces, eight plate metals, gauntlets included', () => {
  // UESP's `Arena:Base Armor`, read 2026-10-17: **seven** pieces, because the shoulders are
  // separate — helm, left and right pauldron, cuirass, gauntlets, greaves, boots — in leather,
  // chain and plate, and plate alone in the eight metals. The port had five pieces, no
  // pauldrons and one plate; a player could punch in plate gauntlets (they are in `WEAPONS`)
  // but never **wear** a pair.
  const pieces = ['cuirass', 'helm', 'pauldron-left', 'pauldron-right', 'greaves', 'gauntlets', 'boots'];
  const grades = ['leather', 'chain', 'plate'];
  for (const material of grades) {
    for (const piece of pieces) {
      const id = piece === 'gauntlets' ? `${material}-gauntlet` : `${material}-${piece}`;
      const item = itemById(id);
      assert.ok(item, `${id} is in the catalog`);
      assert.equal(item.kind, 'armour');
      assert.equal(item.slot, piece, `${id} fills the ${piece} slot`);
      assert.equal(item.material, material);
      assert.ok(item.armour > 0);
    }
  }
  // **The plate metals**: UESP's ladder moves the rating and the price together, iron the
  // cheapest and weakest, ebony the dearest and strongest.
  const metals = ['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony'];
  const cuirasses = metals.map((metal) => itemById(`${metal}-plate-cuirass`));
  for (const item of cuirasses) assert.ok(item && item.kind === 'armour' && item.slot === 'cuirass', 'a metal plate cuirass');
  assert.ok(cuirasses[0].armour < cuirasses[cuirasses.length - 1].armour, 'ebony plate is stronger than iron');
  for (let i = 1; i < cuirasses.length; i++) assert.ok(cuirasses[i - 1].price <= cuirasses[i].price, 'and dearer');
  assert.equal(itemsOfKind('armour').length, grades.length * pieces.length + metals.length * pieces.length,
    'three plain grades and eight plate metals, each across the seven pieces');

  // The armour gauntlet must not take the **weapon** row's id: `chain-gauntlets` and
  // `plate-gauntlets` are Arena's own weapon bases and the catalog's ids are unique.
  assert.equal(itemById('chain-gauntlets').kind, 'weapon');
  assert.equal(itemById('plate-gauntlets').kind, 'weapon');
  assert.equal(itemById('chain-gauntlet').kind, 'armour');

  // **Shields in every metal**: four types, each plain (steel-equivalent) and in the eight
  // metals — UESP's shield table has a material modifier for every one.
  const shielded = itemsOfKind('shield');
  assert.equal(shielded.length, 4 + 4 * metals.length, `${shielded.length} shields`);
  for (const id of ['buckler', 'round-shield', 'kite-shield', 'tower-shield']) {
    assert.ok(itemById(id), `${id} is still the plain shield`);
  }
  assert.ok(itemById('ebony-tower-shield').armour > itemById('tower-shield').armour, 'an ebony tower shield is stronger than a plain one');
  assert.ok(itemById('iron-buckler').armour <= itemById('buckler').armour, 'iron is not');

  // **Wearing them no longer just sums.** UESP's armour rating is per body area (D-68):
  // `equipFromBag` still writes `armour[item.slot]` and the rating is the weighted average
  // over the body, so one plate gauntlet protects the hands (9) and leaves seven areas bare —
  // 9 of the body's weight × 12% = 1.08, which reads 1. The old expectation (3) was the
  // invented "plate is 3 per piece" scale this audit replaced.
  const gloved = equipFromBag(character(), addToBag(createBag(), 'plate-gauntlet'), 'plate-gauntlet');
  assert.equal(gloved.ok, true, gloved.reason);
  assert.equal(gloved.character.armour.gauntlets, 'plate-gauntlet');
  assert.equal(gloved.character.armour.cuirass, undefined, 'and nothing else is invented');
  assert.equal(armourRating(gloved.character), 1, 'a gauntlet protects the hands and nothing else');
  assert.equal(armourOn(gloved.character, 'hands'), 9, 'UESP: plate is −9');
  assert.equal(armourOn(gloved.character, 'head'), 0, 'and the head is bare');
  const shoulder = equipFromBag(character(), addToBag(createBag(), 'leather-pauldron-left'), 'leather-pauldron-left');
  assert.equal(shoulder.character.armour['pauldron-left'], 'leather-pauldron-left', 'a shoulder is a slot of its own');
});

test('every spell the install ships is one the game can cast, and the scrolls name them', async () => {
  // **The magic half of the owner's request**, held as a join rather than as a claim: the
  // install's own `SPELLSG.65` carries 64 named records, `game/spells.js` must have a meaning for
  // every one (an unknown record reaches the library with no effects at all and cannot be cast),
  // and a scroll here must name a spell that survives that test.
  const file = parseSpellsFile(await nodeSource(ARENA).getBytes('SPELLSG.65'));
  const library = buildSpellLibrary(file.named);
  assert.equal(file.named.length, 64, 'Arena ships 64 standard spells');
  assert.equal(library.spells.length, 64);
  assert.deepEqual(library.unknown, [], 'every standard spell has a meaning here');
  for (const spell of library.spells) {
    assert.ok(spell.effects.length > 0, `${spell.name} does something`);
    assert.ok(spell.points > 0, `${spell.name} costs something`);
  }
  for (const name of SCROLL_SPELLS) {
    const spell = library.byName.get(name.toLowerCase());
    assert.ok(spell, `${name} is in the install's spell file`);
    assert.ok(spell.effects.length > 0, `and a scroll of it is a cast the game can perform`);
  }
  // What a scroll actually hands over: the spell's own name, for the caller to cast.
  const read = useFromBag(character(), addToBag(createBag(), 'scroll-fireball'), 'scroll-fireball');
  assert.equal(read.ok, true, read.reason);
  assert.equal(read.effect.spell, 'Fireball');
  assert.ok(library.byName.get('fireball').effects.length > 0);
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
  assert.deepEqual(ITEM_KINDS, ['weapon', 'armour', 'shield', 'potion', 'scroll', 'misc', 'jewelry']);
  for (const material of MATERIALS) {
    const bar = itemById(material.id);
    assert.ok(bar && bar.kind === 'misc', `${material.id} is a bar of metal`);
    assert.match(itemNote(bar), /smithing/);
  }
  assert.match(itemNote(itemById('longsword')), /2–16 damage/);
  // UESP: leather is −3, chain −6, plate −9; the catalogue prints the positive form.
  assert.match(itemNote(itemById('leather-cuirass')), /3 armour/);
  // UESP: a potion is its spell **cast at level 16**, so Healing is Heal's 17–95 health —
  // 56 at the midpoint, which is the dose the row carries.
  assert.match(itemNote(itemById('potion-heal')), /heals 56 health/);
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
  assert.equal(drunk.character.health, 66, '56 health back (Heal at level 16)');
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
  // **Arena's own potion list** (UESP, read 2026-10-17): Restore Power, Stamina, Purification,
  // Free Action, Invisibility and Strength are real potions the port did not sell; a
  // "Potion of Shielding" is not a thing Arena has, so the old check was testing an invention.
  // The three figures UESP prints outright are used as printed: Restore Power is **25** spell
  // points, Strength is Orc Strength's **+15**, and Purification is Purify — 100 health, the
  // poison gone and Sanctuary (this project's ward).
  const power = useFromBag(character({ spellPoints: 10 }), addToBag(bag, 'potion-restore-power'), 'potion-restore-power');
  assert.equal(power.character.spellPoints, 35, '25 spell points back');
  const stamina = useFromBag(character(), addToBag(bag, 'potion-stamina'), 'potion-stamina');
  assert.equal(stamina.effect.kind, 'stamina', 'the bar is the scene\'s to fill, so the dose comes back');
  const pure = useFromBag(character({ health: 10, afflictions: ['poison', 'disease'] }), addToBag(bag, 'potion-purification'), 'potion-purification');
  assert.deepEqual(pure.character.afflictions, [], 'purification clears both');
  assert.equal(pure.character.freeAction, true, 'and any hold with them');
  assert.ok(pure.character.health > 10, `and it heals (${pure.character.health})`);
  assert.ok(pure.character.ward >= 10, `Sanctuary is raised (${pure.character.ward})`);
  const strong = useFromBag(character(), addToBag(bag, 'potion-strength'), 'potion-strength');
  assert.equal(strong.character.strengthBuff, 15, 'Orc Strength\'s +15');
  const unseen = useFromBag(character(), addToBag(bag, 'potion-invisibility'), 'potion-invisibility');
  assert.equal(unseen.character.invisible, true);
  assert.equal(itemById('potion-heal-great').id, 'potion-heal-true', 'a retired id is read as the Arena potion it became');
  assert.equal(itemsOfKind('potion').length, 15, 'UESP lists fifteen potions');
});

test('every one of UESP\'s fifteen potions is drunk, spent, and has a line', () => {
  // The list is the source's, so the *behaviour* has to be this project's side of the join:
  // a potion whose `effect.kind` nothing applies is a bottle of coloured water, and the old
  // catalogue had three of those (the invented Shielding/Light/Water Breathing).
  const potions = itemsOfKind('potion');
  assert.equal(potions.length, 15, 'UESP: fifteen potions');
  for (const potion of potions) {
    const result = useFromBag(character({ health: 10, spellPoints: 10, afflictions: ['poison'] }), addToBag(createBag(), potion.id), potion.id);
    assert.equal(result.ok, true, `${potion.name}: ${result.reason}`);
    assert.ok(result.note.length > 0, `${potion.name} says what it did`);
    assert.ok(itemNote(potion).length > 0, `${potion.name} has a line on the shelf`);
    assert.equal(result.bag.length, 0, `${potion.name} is spent doing it`);
  }
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
  // UESP's areas: plate cuirass 9 on the chest, chain helm 6 on the head, a buckler 1 on the
  // hands and the left arm. Weighted over the body that is (9·30 + 6·8 + 1·10 + 1·10) / 100
  // = 3.34, which the sheet prints as 3 — and the fight asks the area, not the average.
  assert.equal(armourRating(dressed), 3);
  assert.equal(armourOn(dressed, 'chest'), 9, 'the cuirass covers the chest');
  assert.equal(armourOn(dressed, 'head'), 6, 'and the chain helm the head');
  assert.equal(armourOn(dressed, 'rightArm'), 0, 'nothing covers the right arm');
  assert.equal(armourOn(dressed, 'hands'), 1, 'the buckler covers the hands');
  assert.equal(armourRating(character()), 0);
  assert.equal(armourRating(character({ armour: { cuirass: 'not-a-thing' } })), 0, 'a save file cannot add armour out of thin air');
  const steel = weaponHeld({ weapon: 'longsword', material: 'steel' });
  assert.deepEqual([steel.min, steel.max], [2, 16]);
  const iron = weaponHeld({ weapon: 'longsword', material: 'iron' });
  assert.deepEqual([iron.min, iron.max], [2, 14], 'iron is 0 on the low end and −2 on the high');
  // **No weapon is a fist**, which is the fight's own default (`combat.js`'s `resolveAttack`) and
  // the state a new character is in until they equip the weapon in their pack. This check used to
  // read `longsword` ("the default arm"): the HUD promised a sword to a character who had never
  // held one, which is one half of the owner's "always the dagger animation".
  assert.equal(weaponHeld({}).item.id, 'fists', 'the default arm is an empty hand');
  assert.equal(weaponCarried({}).id, 'fists', 'and the panel agrees with the HUD');
});

test('a new character walks out with the class weapon in the pack and empty hands', () => {
  // **The class's own weapon**, from UESP's table (Arena: "Warriors and their subclasses begin
  // with a broadsword", rogues with a shortsword, mages with a dagger) — and **carried, not
  // wielded**: in Arena the weapon is in the pack and the player equips it, which is why the
  // first-person view of a fresh character is the install's `HAND.CIF` and not a blade. This
  // port gave every class a wielded dagger, which is the "always the dagger animation" report.
  const classes = { broadsword: ['archer', 'barbarian', 'knight', 'monk', 'ranger', 'warrior'],
    shortsword: ['acrobat', 'assassin', 'bard', 'burglar', 'rogue', 'thief'],
    dagger: ['battlemage', 'healer', 'mage', 'nightblade', 'sorceror', 'spellsword'] };
  for (const [weapon, ids] of Object.entries(classes)) {
    for (const id of ids) {
      assert.equal(STARTING_WEAPON_OF_CLASS[id], weapon, `${id} begins with a ${weapon}`);
      const kit = startingKit(id);
      assert.equal(countInBag(kit.bag, weapon), 1, `${id}'s pack holds the ${weapon}`);
      assert.equal(kit.equipment.weapon, 'fists', `${id} begins unarmed`);
      assert.equal(countInBag(kit.bag, 'potion-heal'), 1);
      assert.equal(kit.equipment.material, 'iron');
      assert.equal(kit.equipment.armour.cuirass, 'leather-cuirass');
      // …and every piece of it is real, which is the point of a starting kit.
      for (const stack of kit.bag) assert.ok(itemById(stack.id), stack.id);
      for (const id2 of Object.values(kit.equipment.armour)) assert.ok(itemById(id2), id2);
    }
  }
  assert.equal(Object.keys(STARTING_WEAPON_OF_CLASS).length, 18, 'all eighteen classes are placed');
  // An unknown or absent class still gets something usable rather than an empty pack.
  assert.equal(countInBag(startingKit().bag, 'dagger'), 1);
  assert.equal(countInBag(startingKit('not-a-class').bag, 'dagger'), 1);

  // **The bare hand reads its own numbers.** An unarmed character — which is how every new
  // character begins now (`startingKit`) — must see fists on the panel, not whatever `ITEMS[0]`
  // happens to be, and the range must be the one the fight will roll (`resolveAttack` adds the
  // material's own modifier and floors at 1, so a fist "edged" with iron is 1–1).
  const bare = weaponHeld({ weapon: 'fists', material: 'iron' });
  assert.equal(bare.item.id, 'fists');
  assert.equal(bare.item.name, 'Fists');
  assert.deepEqual([bare.min, bare.max], [1, 1], 'iron is −1 and the floor is 1, exactly as the swing rolls');
  assert.deepEqual([weaponHeld({ weapon: 'fists', material: 'steel' }).min,
    weaponHeld({ weapon: 'fists', material: 'steel' }).max], [1, 2], 'with steel, fists are 1–2');
  assert.equal(weaponHeld({ weapon: 'not-a-weapon' }).item.id, 'fists', 'an unknown arm is a fist here too');
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

// The owner, 2026-10-22: *"if you sell something it needs to get unequipped"*. Equipment stays
// in the pack while it is worn (`equipFromBag`), so the last copy leaving the pack has to leave
// the body it was on — otherwise the sale paid the player and left the sword in their hand.
test('selling the last copy of something worn takes it off the body', () => {
  const armed = equipFromBag(character(), addToBag(createBag(), 'longsword'), 'longsword');
  assert.equal(armed.ok, true, armed.reason);
  assert.equal(armed.character.weapon, 'longsword');
  const sold = sellItem(armed.character, armed.bag, 'longsword', { kind: 'equipment' });
  assert.equal(sold.ok, true, sold.reason);
  assert.equal(countInBag(sold.bag, 'longsword'), 0);
  assert.equal(sold.character.weapon, 'fists', 'the empty hand is a fist');
  assert.equal(sold.character.weaponItem, null);
  assert.deepEqual(sold.unequipped, ['weapon']);
  assert.match(sold.note, /sold for \d+ gold/);
  assert.match(sold.note, /came off your body/);

  // A second copy in the pack is still the player's: the one in hand stays in hand.
  const two = equipFromBag(character(), addToBag(addToBag(createBag(), 'longsword'), 'longsword'), 'longsword');
  const one = sellItem(two.character, two.bag, 'longsword', { kind: 'equipment' });
  assert.equal(one.character.weapon, 'longsword');
  assert.deepEqual(one.unequipped, []);

  // A shield and a worn piece follow the same rule.
  const shield = equipFromBag(character(), addToBag(createBag(), 'buckler'), 'buckler');
  const shieldSold = sellItem(shield.character, shield.bag, 'buckler', { kind: 'equipment' });
  assert.equal(shieldSold.character.shield, null);
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

test('a back at its limit takes nothing more — not even something weightless', () => {
  // Strength 50 is the ceiling the game rolls, and 50 + 2 × 50 = 150 kg. Seven ebony tower
  // shields at 20 kg and ten daggers at 1 kg land on it exactly, so the boundary is the test
  // rather than an overflow.
  const strong = character({ strength: 50 });
  const bag = addToBag(addToBag(createBag(), 'ebony-tower-shield', 7), 'dagger', 10);
  assert.equal(maxCarryWeight(strong), 150);
  assert.equal(carriedWeight(strong, bag), 150);
  const full = carryStatus(strong, bag, null, 0);
  assert.equal(full.atLimit, true);
  assert.equal(full.over, 0, 'not past the limit, exactly on it');
  // The loot paths refuse on `atLimit` rather than `over` alone (`scenes/interior.js`'s
  // `takeLoot` and `takeFromCorpse`): a chest of gold has no weight to overflow with, and a
  // player whose back is full must still not be able to fill their purse from it.
  const feather = carryStatus(strong, bag, { name: 'a feather', weight: 0 }, 1);
  assert.equal(feather.atLimit, true, 'a full back takes nothing, weightless or not');
  assert.equal(feather.ok, true, 'the carry check itself only reports; atLimit is what refuses');
  const over = carryStatus(strong, bag, 'dagger', 1);
  assert.equal(over.ok, false, 'one kilo past the limit is refused');
  assert.equal(over.over, 1);
  // Room is real room: drop one dagger and the same back can take it again.
  const lighter = removeFromBag(bag, 'dagger', 1);
  assert.equal(carriedWeight(strong, lighter), 149);
  assert.equal(carryStatus(strong, lighter, 'dagger', 1).ok, true);
  assert.equal(carryStatus(strong, lighter, 'dagger', 1).atLimit, true, 'and it lands full again');
});
