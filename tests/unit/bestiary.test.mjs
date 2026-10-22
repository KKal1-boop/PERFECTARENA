// WHAT EACH CREATURE IS BESIDES ITS STAT BLOCK.
//
// UESP's `Arena:Monsters` page (read 2026-10-17) prints an abilities line under every
// creature, and it is the half of "all kinds of enemies" a hit-point table cannot carry: the
// mundane-weapon floors, silver at a vampire, the ice golem's fear of fire, the spider's hold,
// the lich's regeneration, the creatures that see through invisibility, and which of them
// throw magic. `game/bestiary.js` is that reading; this file holds it to the page, and holds
// the fight to it through `resolveAttack` and `monsterAttack`.
//
// Run:  node --test tests/unit/bestiary.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABILITIES, CASTER_IDS, MATERIAL_TIER, canHurt, castFor, damageMultiplier, elementOf,
  isIrresistible, paralyses, regenerationOf, seesInvisible, spellOf, transmitsDisease,
} from '../../src/game/bestiary.js';
import { MATERIALS, monsterAttack, resolveAttack } from '../../src/game/combat.js';
import { MONSTERS, monsterById } from '../../src/game/monsters.js';
import { RANGED_IDS, fireBolt } from '../../src/game/ranged.js';

test('the material ladder is `combat.js`\'s own order, copied on purpose', () => {
  // `bestiary.js` does not import `combat.js` (combat imports bestiary, and a cycle that
  // reads MATERIALS at module top level is a TDZ page). The copy is pinned here instead.
  assert.deepEqual([...MATERIAL_TIER], MATERIALS.map((material) => material.id));
});

test('every one of UESP\'s twenty-four entries has a line, and only those', () => {
  const ids = MONSTERS.map((monster) => monster.id).sort();
  assert.equal(ids.length, 24, 'UESP lists 23 creatures and Jagar Tharn');
  assert.deepEqual(Object.keys(ABILITIES).sort(), ids, 'the abilities table is the bestiary, no more and no less');
});

test('a metal under the creature\'s floor is no blow at all — the immunity ladder', () => {
  const steel = { weapon: 'longsword', material: 'steel' };
  const cases = [
    ['icegolem', 'steel', 'elven'],
    ['stonegolem', 'steel', 'dwarven'],
    ['medusa', 'steel', 'dwarven'],
    ['vampire', 'steel', 'dwarven'],
    ['irongolem', 'steel', 'mithril'],
    ['firedaemon', 'steel', 'mithril'],
    ['lich', 'steel', 'mithril'],
  ];
  for (const [id, metal, need] of cases) {
    const refused = canHurt(monsterById(id), { ...steel, material: metal });
    assert.equal(refused.ok, false, `${id} shrugs off ${metal}`);
    assert.match(refused.reason, new RegExp(need), `${id} needs ${need}`);
    const landed = canHurt(monsterById(id), { ...steel, material: need });
    assert.equal(landed.ok, true, `${id} yields to ${need}`);
  }
  // The ice golem is the one source-made exception: "although fists can hurt them".
  assert.equal(canHurt(monsterById('icegolem'), { weapon: 'fists', material: 'steel' }).ok, true);
  assert.equal(canHurt(monsterById('icegolem'), { weapon: 'chain-gauntlets', material: 'steel' }).ok, true);
  // Jagar Tharn is not a metal question at all: no melee weapon lands.
  for (const material of MATERIAL_TIER) {
    assert.equal(canHurt(monsterById('jagartharn'), { weapon: 'ebony-longsword', material }).ok, false, material);
  }
});

test('steel cannot wound a fire daemon, and the fight says why instead of spilling blood', () => {
  const attacker = { level: 20, attributes: { strength: 60, luck: 50 } };
  const daemon = { id: 'firedaemon', name: 'Fire Daemon', level: 20, attributes: { agility: 50 } };
  const refused = resolveAttack({ attacker, defender: daemon, weapon: 'longsword', material: 'steel', random: { nextBelow: () => 0 } });
  assert.equal(refused.immune, true);
  assert.equal(refused.hit, false);
  assert.equal(refused.damage, 0);
  assert.match(refused.reason, /mithril/);
  const landed = resolveAttack({ attacker, defender: daemon, weapon: 'longsword', material: 'mithril', random: { nextBelow: () => 0 } });
  assert.equal(landed.immune, undefined);
  assert.equal(landed.hit, true, 'a mithril blade lands');
  assert.ok(landed.damage >= 1);
});

test('silver cuts a vampire twice as deep as an equal metal', () => {
  const attacker = { level: 10, attributes: { strength: 50, luck: 50 } };
  const vampire = { id: 'vampire', name: 'Vampire', level: 20, attributes: { agility: 50 } };
  const blow = (material) => resolveAttack({
    attacker, defender: vampire, weapon: 'longsword', material, guaranteedHit: true,
    random: { nextBelow: (n) => n - 1 },
  });
  const silver = blow('silver');
  const dwarven = blow('dwarven');
  // Silver is *below* the vampire's dwarven floor by the metal ladder and still bites — UESP
  // says so in its own prose — and its law is doubling, not a damage tier.
  assert.equal(silver.multiplier, 2);
  assert.equal(silver.damage, Math.ceil(silver.raw * 2));
  assert.equal(dwarven.multiplier, 1, 'a dwarven blade lands, and lands once');
  assert.ok(dwarven.damage > 0);
});

test('a skeleton shrugs off a sword and not a mace; a golem fears fire and drinks lightning', () => {
  const skeleton = monsterById('skeleton');
  assert.equal(damageMultiplier(skeleton, { weapon: 'longsword', material: 'steel' }), 0.5);
  assert.equal(damageMultiplier(skeleton, { weapon: 'battle-axe', material: 'steel' }), 0.5);
  assert.equal(damageMultiplier(skeleton, { weapon: 'mace', material: 'steel' }), 1);
  assert.equal(damageMultiplier(skeleton, { weapon: 'fists', material: 'steel' }), 1);
  assert.equal(damageMultiplier(monsterById('icegolem'), { element: 'fire' }), 2, 'vulnerable to fire');
  assert.equal(damageMultiplier(monsterById('icegolem'), { element: 'cold' }), 0.5, 'resistant to cold');
  assert.equal(damageMultiplier(monsterById('firedaemon'), { element: 'fire' }), 0.5);
  assert.equal(damageMultiplier(monsterById('irongolem'), { element: 'shock' }), 0, 'the golem drinks it');
  assert.equal(damageMultiplier(monsterById('minotaur'), { element: 'magic' }), 0.5);
  assert.equal(damageMultiplier(monsterById('rat'), { element: 'fire' }), 1);
});

test('the casters are UESP\'s, not the six the bolt list used to name', () => {
  for (const id of ['ghost', 'wraith', 'homonculus', 'firedaemon', 'medusa', 'lich']) {
    assert.ok(RANGED_IDS.includes(id), `${id} still casts`);
  }
  for (const id of ['snowwolf', 'hellhound', 'stonegolem', 'vampire', 'jagartharn']) {
    assert.ok(RANGED_IDS.includes(id), `${id} casts in UESP's own line and did not here before`);
  }
  for (const id of ['rat', 'goblin', 'wolf', 'orc', 'skeleton', 'troll']) {
    assert.equal(RANGED_IDS.includes(id), false, `${id} closes`);
  }
  assert.deepEqual([...RANGED_IDS].sort(), [...CASTER_IDS].sort());
  assert.equal(spellOf('snowwolf'), 'Ice Bolt');
  assert.equal(spellOf('hellhound'), 'Fireball');
  assert.equal(spellOf('lich'), 'Lightning');
  assert.equal(spellOf('stonegolem'), 'Force Bolt');
  assert.equal(spellOf('jagartharn'), 'Lightning');
});

test('Jagar Tharn throws UESP\'s six spells, in the page\'s own order', () => {
  // The page's entry: "Casts Wizard's Fire, Ice Bolt, Wyvern's Sting, Lightning, Far Silence,
  // and Spell Drain". One bolt with one element was one sixth of the source's endgame.
  const names = [0, 1, 2, 3, 4, 5].map((i) => castFor('jagartharn', i).spell);
  assert.deepEqual(names, [
    'Wizard\'s Fire', 'Ice Bolt', 'Wyvern\'s Sting', 'Lightning', 'Far Silence', 'Spell Drain',
  ]);
  assert.deepEqual([0, 1, 2, 3].map((i) => castFor('jagartharn', i).element), ['fire', 'cold', 'poison', 'shock']);
  assert.equal(castFor('jagartharn', 6).spell, 'Wizard\'s Fire', 'the six repeat');
  // A creature with one spell keeps giving that one, and a creature with none wants none.
  assert.equal(castFor('snowwolf', 3).spell, 'Ice Bolt');
  assert.equal(castFor('rat'), null);
  // The bolt carries the spell's own element, not the creature's single caster element.
  const at = { x: 0, y: 2, z: 0 }, to = { x: 5, y: 2, z: 0 };
  const second = castFor('jagartharn', 1);
  const bolt = fireBolt(at, to, { damage: 10, id: 'jagartharn', element: second.element, spell: second.spell });
  assert.equal(bolt.element, 'cold');
  assert.equal(bolt.spell, 'Ice Bolt');
});

test('a bolt is made of its caster\'s element, and the stone golem\'s ignores resistance', () => {
  const at = { x: 0, y: 2, z: 0 }, to = { x: 5, y: 2, z: 0 };
  assert.equal(fireBolt(at, to, { damage: 10, id: 'firedaemon' }).element, 'fire');
  assert.equal(fireBolt(at, to, { damage: 10, id: 'snowwolf' }).element, 'cold');
  assert.equal(fireBolt(at, to, { damage: 10, id: 'lich' }).element, 'shock');
  assert.equal(fireBolt(at, to, { damage: 10, id: 'firedaemon' }).irresistible, false);
  assert.equal(fireBolt(at, to, { damage: 10, id: 'stonegolem' }).irresistible, true);
  assert.equal(fireBolt(at, to, { damage: 10, id: 'snowwolf' }).caster, 'snowwolf');
  assert.equal(isIrresistible('stonegolem'), true);
  assert.equal(elementOf('wolf'), 'magic', 'a plain bite is not an element');
});

test('the holds, the diseases, the regeneration and the eyes that see through invisibility', () => {
  assert.equal(paralyses('spider'), 'melee');
  assert.equal(paralyses('lizardman'), 'melee');
  assert.equal(paralyses('medusa'), 'ranged');
  assert.equal(paralyses('wolf'), null);
  for (const id of ['rat', 'ghoul', 'zombie', 'vampire']) assert.equal(transmitsDisease(id), true, id);
  assert.equal(transmitsDisease('skeleton'), false);
  assert.equal(regenerationOf('troll'), 2);
  assert.equal(regenerationOf('vampire'), 3);
  assert.equal(regenerationOf('lich'), 4);
  assert.equal(regenerationOf('orc'), 0);
  for (const id of ['firedaemon', 'ghost', 'wraith', 'vampire', 'lich', 'jagartharn']) {
    assert.equal(seesInvisible(id), true, `${id} sees the unseen`);
  }
  assert.equal(seesInvisible('goblin'), false);
});

test('a monster\'s blow carries its own element through `monsterAttack`', () => {
  const random = { nextBelow: () => 0 };
  const firedaemon = monsterAttack({ monster: monsterById('firedaemon'), target: { level: 1 }, random });
  assert.equal(firedaemon.element, 'fire');
  const wolf = monsterAttack({ monster: monsterById('wolf'), target: { level: 1 }, random });
  assert.equal(wolf.element, 'magic');
  assert.equal(typeof firedaemon.damage, 'number');
});
