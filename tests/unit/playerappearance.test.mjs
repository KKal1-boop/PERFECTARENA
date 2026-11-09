// THE PLAYER'S CHOSEN BODY — the creator's catalogue and the law that paints it.
//
// The owner, 2026-10-19: *"add to the character creation at the start of the game a visual
// character creation that makes you choose your sprite between all the available npcs sprites
// and lets you change skin and hair color and gives the correct 360 animation + walking+ attack
// animation you chose to your character"*, and then: *"to play as an argonian or khajeet you
// also should be able to play as an orange white wolf or a lizard man"*.
//
// These pins hold the catalogue to the archive's own naming law: the lizard and the wolf are
// whole bodies with five shipped angles and Arena's twelve-frame strike, the cat is the wolf
// repainted by `raceSkin.js`'s `khajiitFur`, and a race the install cannot draw as a person
// arrives in the figure that stands in for it rather than a palette over a human.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APPEARANCE_VIEWS, NPC_SPRITES, appearanceAttack, appearanceSkinSpec, appearanceWalkFile,
  defaultSpriteFor, normalizeAppearance, spriteById,
} from '../../src/game/playerAppearance.js';

const byId = (id) => NPC_SPRITES.find((sprite) => sprite.id === id) ?? null;

test('the catalogue holds the citizens, the armoured roster, the lizard and the orange wolf', () => {
  assert.ok(NPC_SPRITES.length >= 20, `${NPC_SPRITES.length} bodies`);
  assert.equal(new Set(NPC_SPRITES.map((s) => s.id)).size, NPC_SPRITES.length, 'ids are unique');
  // **The plate fighter as a woman is not in this install.** `11PLTWLK.CFA` and `11PLTATT.CFA`
  // are absent from `GLOBAL.BSA` (only `01PLT…` ships), so she is not in the catalogue at all —
  // a blank card is not a body a player can choose.
  assert.equal(byId('armour-plt-female'), null, 'the missing female plate figure is not offered');
  // **The bare-chested unarmoured woman is not offered either** (owner, 2026-11-04: *"if you
  // chose a woman you can see her bare chest and she should use the covered sprite"*). The
  // covered leather fighter is the same role and is in the catalogue.
  assert.equal(byId('armour-una-female'), null, 'the bare unarmoured woman is not offered');
  assert.ok(byId('armour-ltr-female'), 'the covered leather fighter (woman) is offered');
  assert.ok(byId('armour-plt-male'), 'the male plate fighter the install does ship is offered');
  for (const id of ['man-tunic', 'woman-dress', 'guard', 'armour-una-male', 'lizard-man', 'cat-folk']) {
    assert.ok(byId(id), `${id} is offered`);
  }
  assert.equal(byId('wolf-snow'), null, 'the only wolf offered is the orange one, never the white snow wolf');
  // Every body has five angles (mirrored to the eight directions) and an attack animation.
  for (const sprite of NPC_SPRITES) {
    assert.ok(sprite.label && sprite.note && sprite.walk, `${sprite.id} is labelled`);
    for (let view = 1; view <= 5; view++) assert.match(sprite.walk(view), /\.CFA$/, `${sprite.id} view ${view}`);
    assert.ok(appearanceAttack(sprite.id)?.file, `${sprite.id} has an attack animation`);
  }
  assert.deepEqual(APPEARANCE_VIEWS.map((v) => v.view), [1, 2, 3, 4, 5, 4, 3, 2]);
});

test('a citizen with no strike art attacks in its own clothes, never a borrowed stranger', () => {
  // The owner, 2026-11-04: *"man in a tunic man in a shirt woman in blue woman in a bodice
  // specifically change person during attack animation and shouldnt."* Those four families ship
  // no strike, so the blow is the same walk sheet, under the same palette and hair entries.
  for (const id of ['man-tunic', 'man-shirt', 'woman-coat', 'woman-bodice']) {
    const blow = appearanceAttack(id);
    assert.equal(blow.file, appearanceWalkFile(id, 1), `${id}: its own walk sheet`);
    assert.equal(blow.sameSheet, true, `${id}: the sheet is its own`);
    assert.equal(blow.strike, false, `${id}: it does not pretend to have drawn strike art`);
    assert.deepEqual(blow.frames, [0, 1, 2, 1], `${id}: its own stride poses`);
  }
  // The armoured figures really do have their own forward-facing strike.
  const armour = appearanceAttack('armour-mag-female');
  assert.equal(armour.file, '11MAGATT.CFA');
  assert.equal(armour.strike, true);
});

test('the lizard and the orange wolf are Arena\u2019s own sheets', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((v) => appearanceWalkFile('lizard-man', v)),
    ['LIZARD1.CFA', 'LIZARD2.CFA', 'LIZARD3.CFA', 'LIZARD4.CFA', 'LIZARD5.CFA']);
  assert.deepEqual([1, 2, 3, 4, 5].map((v) => appearanceWalkFile('cat-folk', v)),
    ['SWOLF01.CFA', 'SWOLF02.CFA', 'SWOLF03.CFA', 'SWOLF04.CFA', 'SWOLF05.CFA']);
  // The twelve-frame layout: the blow is frames 8–11 of the front sheet, not another file.
  for (const id of ['lizard-man', 'cat-folk', 'guard', 'woman-dress']) {
    const blow = appearanceAttack(id);
    assert.equal(blow.sameSheet, true, `${id} strikes from its own sheet`);
    assert.equal(blow.strike, true, `${id} has Arena\u2019s own strike art`);
    assert.deepEqual(blow.frames, [8, 9, 10, 11]);
    assert.equal(blow.file, appearanceWalkFile(id, 1));
  }
});

test('a race the install draws as a figure arrives in that figure', () => {
  assert.equal(defaultSpriteFor({ raceId: 'Argonian', classId: 'knight' }).id, 'lizard-man');
  assert.equal(defaultSpriteFor({ raceId: 'argonian', classId: 'mage' }).id, 'lizard-man');
  assert.equal(defaultSpriteFor({ raceId: 'Khajiit', classId: 'warrior' }).id, 'cat-folk');
  // Everyone else keeps the class's armour, exactly as before this feature.
  assert.equal(defaultSpriteFor({ raceId: 'Redguard', classId: 'knight' }).id, 'armour-plt-male');
  const cat = normalizeAppearance(null, { raceId: 'Khajiit', classId: 'warrior' });
  assert.deepEqual(cat, { spriteId: 'cat-folk', skin: null, hair: null, fur: 'tawny' });
  const lizard = normalizeAppearance(null, { raceId: 'Argonian', classId: 'mage' });
  assert.deepEqual(lizard, { spriteId: 'lizard-man', skin: null, hair: null, fur: null });
});

test('the paint law follows the body: human skin, cat coat, or Arena\u2019s own scales', () => {
  const human = normalizeAppearance({ spriteId: 'woman-dress', skin: 'darkElf', hair: 'blonde' });
  assert.deepEqual(human, { spriteId: 'woman-dress', skin: 'darkElf', hair: 'blonde', fur: null });
  assert.equal(appearanceSkinSpec(human), 'darkElf+blonde');

  const cat = normalizeAppearance({ spriteId: 'cat-folk', skin: 'nord', hair: 'red', fur: 'black' });
  assert.deepEqual(cat, { spriteId: 'cat-folk', skin: null, hair: null, fur: 'black' });
  assert.equal(appearanceSkinSpec(cat), 'khajiitFur:black');
  assert.equal(appearanceSkinSpec(normalizeAppearance({ spriteId: 'cat-folk' })), 'khajiitFur');
  assert.equal(appearanceSkinSpec(normalizeAppearance({ spriteId: 'cat-folk', fur: 'nonsense' })), 'khajiitFur');

  // A lizard's palette is its own drawing; painting a race ramp over it is the "green people"
  // mistake `raceSkin.js` records.
  assert.equal(appearanceSkinSpec({ spriteId: 'lizard-man', skin: 'argonian', hair: 'black' }), null);
});

test('changing the body drops the colours that body cannot wear', () => {
  // A human's skin and hair do not follow the player onto a wolf, and the wolf's coat does not
  // follow them back into a human.
  const fromHuman = normalizeAppearance({ spriteId: 'cat-folk', skin: 'nord', hair: 'red' });
  assert.equal(fromHuman.skin, null);
  assert.equal(fromHuman.hair, null);
  const fromCat = normalizeAppearance({ spriteId: 'man-tunic', fur: 'black' });
  assert.equal(fromCat.fur, null);
  // An unknown sprite falls back to the class's body rather than drawing nothing.
  assert.equal(normalizeAppearance({ spriteId: 'not-a-body' }, { raceId: 'Breton', classId: 'bard' }).spriteId,
    spriteById(defaultSpriteFor({ raceId: 'Breton', classId: 'bard' }).id).id);
});
