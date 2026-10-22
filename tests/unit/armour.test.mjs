// WHAT ARMOUR IS WORTH, AND WHERE IT IS WORN (D-68).
//
// `Arena:Base Armor` and `Arena:Base Shields` print an armour rating **per material** and a
// **protected area** per piece; nothing in the page is a single suit total. The port used to
// sum every worn piece into one cosmetic number, which is why a player in full plate was as
// easy to hit as one in rags. `game/armour.js` is the reading, and this file holds it to the
// source: the numbers, the coverage, and the one place the fight spends them.
//
// Run:  node --test tests/unit/armour.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AREAS, AREA_WEIGHT, MATERIAL_PROTECTION, METAL_SHIFT, PIECE_AREAS, SHIELD_AREAS,
  SHIELD_PROTECTION, armourAt, armourRating, coverage, rolledArea,
} from '../../src/game/armour.js';
import { itemById } from '../../src/game/items.js';
import { hitChance, monsterAttack } from '../../src/game/combat.js';
import { ArenaRandom } from '../../src/game/arenaRandom.js';

const lookup = (id) => itemById(id);

test('the ratings are UESP\'s: leather −3, chain −6, plate −9, and the metals move plate', () => {
  assert.deepEqual(MATERIAL_PROTECTION, { leather: 3, chain: 6, plate: 9 });
  // UESP's plate column: iron +1 (worse), steel/silver 0, elven −1 … ebony −5.
  assert.deepEqual(METAL_SHIFT, { iron: -1, steel: 0, silver: 0, elven: 1, dwarven: 2, mithril: 3, adamantium: 4, ebony: 5 });
  assert.equal(itemById('leather-cuirass').armour, 3);
  assert.equal(itemById('chain-cuirass').armour, 6);
  assert.equal(itemById('plate-cuirass').armour, 9);
  assert.equal(itemById('iron-plate-cuirass').armour, 8, 'iron plate is −8');
  assert.equal(itemById('ebony-plate-cuirass').armour, 14, 'ebony plate is −14');
  // Every piece of a suit carries its material's rating — the piece decides the *area*.
  for (const piece of ['helm', 'cuirass', 'pauldron-left', 'pauldron-right', 'gauntlet', 'greaves', 'boots']) {
    assert.equal(itemById(`chain-${piece}`).armour, 6, `chain ${piece} is 6`);
  }
});

test('the shield types are UESP\'s −1…−4 with the same metal shift', () => {
  assert.deepEqual(SHIELD_PROTECTION, { buckler: 1, 'round-shield': 2, 'kite-shield': 3, 'tower-shield': 4 });
  assert.equal(itemById('buckler').armour, 1);
  assert.equal(itemById('tower-shield').armour, 4);
  assert.equal(itemById('iron-buckler').armour, 0, 'iron\'s +1 takes a buckler to zero');
  assert.equal(itemById('ebony-tower-shield').armour, 9, 'a tower shield 4 + ebony 5');
});

test('each piece covers the area the source lists, and a shield covers what it says', () => {
  assert.deepEqual(PIECE_AREAS.helm, ['head']);
  assert.deepEqual(PIECE_AREAS.cuirass, ['chest']);
  assert.deepEqual(PIECE_AREAS['pauldron-left'], ['leftArm']);
  assert.deepEqual(PIECE_AREAS['pauldron-right'], ['rightArm']);
  assert.deepEqual(PIECE_AREAS.gauntlets, ['hands']);
  assert.deepEqual(PIECE_AREAS.greaves, ['waist', 'legs']);
  assert.deepEqual(PIECE_AREAS.boots, ['feet']);
  assert.deepEqual(SHIELD_AREAS.buckler, ['hands', 'leftArm']);
  assert.deepEqual(SHIELD_AREAS['round-shield'], ['hands', 'leftArm', 'waist']);
  assert.deepEqual(SHIELD_AREAS['kite-shield'], ['hands', 'leftArm', 'waist', 'legs']);
  assert.deepEqual(SHIELD_AREAS['tower-shield'], ['hands', 'leftArm', 'waist', 'legs', 'head']);
});

test('a suit protects its own areas and no others', () => {
  const leather = {
    armour: {
      helm: 'leather-helm', cuirass: 'leather-cuirass',
      'pauldron-left': 'leather-pauldron-left', 'pauldron-right': 'leather-pauldron-right',
      gauntlets: 'leather-gauntlet', greaves: 'leather-greaves', boots: 'leather-boots',
    },
  };
  for (const area of AREAS) assert.equal(armourAt(leather, area, lookup), 3, `${area} is covered by leather`);
  assert.equal(armourRating(leather, lookup), 3, 'full leather reads 3, as the page prints it');

  const chestOnly = { armour: { cuirass: 'plate-cuirass' } };
  assert.equal(armourAt(chestOnly, 'chest', lookup), 9);
  for (const area of AREAS.filter((a) => a !== 'chest')) assert.equal(armourAt(chestOnly, area, lookup), 0, area);
  // One plate cuirass averages 9 × 30% = 2.7, which prints 3 — the same *average* as full
  // leather, with seven areas bare instead of none. The figure is an average and says so;
  // the fight reads the area, where the two could not be more different.
  assert.equal(coverage(chestOnly, lookup).covered.length, 1, 'one area covered');
  assert.ok(armourRating(chestOnly, lookup) < 9, 'and nothing like a suit of plate');

  const ebony = {
    armour: {
      helm: 'ebony-plate-helm', cuirass: 'ebony-plate-cuirass',
      'pauldron-left': 'ebony-plate-pauldron-left', 'pauldron-right': 'ebony-plate-pauldron-right',
      gauntlets: 'ebony-plate-gauntlet', greaves: 'ebony-plate-greaves', boots: 'ebony-plate-boots',
    },
  };
  assert.equal(armourRating(ebony, lookup), 14, 'full ebony plate is UESP\'s −14');
  assert.deepEqual(coverage(ebony, lookup).covered, [...AREAS], 'and every area is covered');
});

test('a shield adds its own protection to the areas it covers — the tower shield reaches the head', () => {
  const body = { armour: { cuirass: 'chain-cuirass' }, shield: 'tower-shield' };
  assert.equal(armourAt(body, 'head', lookup), 4, 'the tower shield\'s head coverage');
  assert.equal(armourAt(body, 'hands', lookup), 4);
  assert.equal(armourAt(body, 'chest', lookup), 6, 'the cuirass still covers the chest');
  const buckler = { armour: {}, shield: 'buckler' };
  assert.equal(armourAt(buckler, 'head', lookup), 0, 'a buckler does not cover the head');
  assert.equal(armourAt(buckler, 'leftArm', lookup), 1);
  assert.equal(armourAt({ armour: {}, shield: 'iron-buckler' }, 'hands', lookup), 0, 'iron\'s shield is worth nothing');
  assert.equal(armourAt({}, 'chest', lookup), 0, 'bare skin');
});

test('the area roll lands where the weights say, and nowhere else', () => {
  assert.equal(AREAS.reduce((sum, area) => sum + AREA_WEIGHT[area], 0), 100, 'the weights are percent');
  const random = new ArenaRandom(17);
  const seen = new Map();
  for (let i = 0; i < 8000; i++) {
    const area = rolledArea(random);
    assert.ok(AREAS.includes(area), area);
    seen.set(area, (seen.get(area) ?? 0) + 1);
  }
  const chest = seen.get('chest') / 8000;
  assert.ok(chest > 0.24 && chest < 0.36, `the chest is the commonest target (${(chest * 100).toFixed(1)}%)`);
  for (const area of AREAS) assert.ok((seen.get(area) ?? 0) > 0, `${area} is reachable`);
});

test('armour is subtracted from the blow\'s chance to hit, as UESP says a rating is', () => {
  const attacker = { level: 5, attributes: { luck: 50 } };
  const defender = { level: 5, attributes: { agility: 50 } };
  const bare = hitChance(attacker, defender);
  const leather = hitChance(attacker, defender, { armour: 3 });
  const ebony = hitChance(attacker, defender, { armour: 14 });
  assert.equal(bare - leather, 3);
  assert.equal(bare - ebony, 14);
  assert.ok(ebony >= 5, 'the floor still applies: nothing is untouchable');
});

test('a monster\'s blow reads the armour over the area it struck', () => {
  const monster = { level: 4, damage: [5, 12] };
  const target = { level: 4, attributes: { agility: 50 } };
  const full = Object.fromEntries(AREAS.map((area) => [area, 9]));
  // **One seed, two fights.** Each blow is drawn from a fresh random, so the bare and the
  // plated comparison sees the same area roll and the same to-hit roll; only the chance the
  // armour moves can differ. (Sharing one random across both runs cannot work: a blow that
  // hits spends one more number on damage than one that misses, and the two runs diverge.)
  for (let seed = 1; seed <= 200; seed++) {
    const bare = monsterAttack({ monster, target, random: new ArenaRandom(seed) });
    const plated = monsterAttack({ monster, target, random: new ArenaRandom(seed), armour: (area) => full[area] });
    assert.ok(AREAS.includes(bare.area), bare.area);
    assert.equal(bare.armour, 0, 'no armour function, no protection');
    assert.equal(plated.area, bare.area, 'the area roll is the armour\'s own');
    assert.equal(plated.armour, 9);
    assert.equal(bare.chance - plated.chance, 9, `${bare.area}: 9 points of plate`);
  }
  // …and over many blows, fewer land on a plated body than a bare one.
  const count = (armour) => {
    const r = new ArenaRandom(31);
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (monsterAttack({ monster, target, random: r, armour }).hit) hits++;
    return hits;
  };
  assert.ok(count((area) => full[area]) < count(undefined) * 0.85,
    `plate is worth something: ${count((area) => full[area])} against ${count(undefined)} of 2000`);
});
