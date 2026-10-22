import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { portraitFiles, portraitEquipment, PORTRAIT_RACES, PORTRAIT_WEAPONS } from '../../src/game/characterPortrait.js';
const data = new ArenaData(nodeSource(process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA'));

test('all eight races and both sexes resolve to original bodies and ten selectable faces', async () => {
  for (const gender of ['male', 'female']) for (const raceId of PORTRAIT_RACES) {
    const files = portraitFiles({ raceId, gender });
    const body = await data.img(files.body);
    const faces = await data.cif(files.faces);
    assert.equal(body.width, 320); assert.equal(body.height, 200);
    assert.equal(faces.images.length, 10);
    assert.ok(faces.images.every((i) => i.xOffset > 180 && i.yOffset < 40));
    await data.img(files.shirt); await data.img(files.pants);
  }
});
test('portrait race IDs use original order, not character catalogue order', () => {
  assert.equal(portraitFiles({raceId: 'argonian'}).body, 'CHARBK07.IMG');
  assert.equal(portraitFiles({raceId: 'nord', gender: 'female'}).faces, 'FACESF12.CIF');
});
test('all original weapons have inventory artwork, including flail and bows', async () => {
  for (const sex of ['male', 'female']) {
    const sheet = await data.cif(portraitFiles({gender: sex}).equipment);
    for (let i = 0; i < PORTRAIT_WEAPONS.length; i++) {
      const [layer] = portraitEquipment({weapon: PORTRAIT_WEAPONS[i]});
      assert.equal(layer.index, i);
      assert.ok(sheet.images[i].indices.some((p) => p > 0));
    }
  }
});
test('all seven armor slots and shields have original indices and layering', () => {
  const layers = portraitEquipment({armour: {cuirass: 'leather-cuirass', gauntlets: 'chain-gauntlet', helm: 'ebony-plate-helm', 'pauldron-left': 'plate-pauldron-left', 'pauldron-right': 'plate-pauldron-right', greaves: 'plate-greaves', boots: 'plate-boots'}, shield: 'tower-shield', weapon: 'flail'});
  assert.equal(layers.length, 9);
  assert.equal(layers.find(l=>l.slot==='cuirass').index, 36);
  assert.equal(layers.find(l=>l.slot==='gauntlets').index, 30);
  assert.equal(layers.find(l=>l.slot==='helm').index, 23);
  assert.equal(layers.at(-1).index, 28);
  assert.equal(layers.at(-2).index, 12);
});
