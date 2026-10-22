// Original character-sheet composition, ported from OpenTESArena's MIT-licensed
// ArenaPortraitUtils and CharacterSheetUiMVC. Assets stay in the user's Arena install.
import { itemById } from './items.js';
import { toRgba } from '../arena/palette.js';

export const PORTRAIT_RACES = Object.freeze(['breton', 'redguard', 'nord', 'darkelf', 'highelf', 'woodelf', 'khajiit', 'argonian']);
export const PORTRAIT_WEAPONS = Object.freeze(['staff', 'dagger', 'shortsword', 'broadsword', 'saber', 'longsword', 'claymore', 'tanto', 'wakizashi', 'katana', 'dai-katana', 'mace', 'flail', 'warhammer', 'war-axe', 'battle-axe', 'short-bow', 'long-bow']);
const ARMOR = { cuirass: 0, gauntlets: 1, greaves: 2, 'pauldron-left': 3, 'pauldron-right': 4, helm: 5, boots: 6 };
const ORDER = { cuirass: 6, gauntlets: 8, greaves: 3, 'pauldron-left': 10, 'pauldron-right': 9, helm: 7, boots: 11 };
const SHIELDS = ['buckler', 'round-shield', 'kite-shield', 'tower-shield'];

export function portraitFiles(character) {
  const female = character?.gender === 'female';
  const race = String(character?.raceId ?? character?.race ?? 'breton').toLowerCase().replace(/[\s_-]/g, '');
  const raceIndex = Math.max(0, PORTRAIT_RACES.indexOf(race));
  const magic = Number(character?.maxSpellPoints) > 0 || Number(character?.spellPoints) > 0;
  return {
    body: `${female ? 'CHRBKF' : 'CHARBK'}0${raceIndex}.IMG`,
    faces: `FACES${female ? 'F' : ''}1${raceIndex}.CIF`,
    equipment: `${female ? '1' : '0'}EQUIP.CIF`,
    shirt: `${female ? 'F' : 'M'}${magic ? 'R' : 'S'}SHIRT.IMG`,
    pants: `${female ? 'F' : 'M'}PANTS.IMG`,
    shirtPosition: female ? [220, magic ? 33 : 35] : magic ? [215, 35] : [186, 12],
    pantsPosition: female ? [212, 74] : [229, 82],
  };
}

export function portraitEquipment(character) {
  const layers = [];
  for (const [slot, id] of Object.entries(character?.armour ?? {})) {
    const item = itemById(id);
    if (!item || ARMOR[slot] == null) continue;
    const offset = item.material === 'leather' ? 18 : item.material === 'chain' ? 11 : 0;
    layers.push({ slot, item: item.id, index: 18 + offset + ARMOR[slot], order: ORDER[slot] });
  }
  const weapon = itemById(character?.weaponItem ?? character?.weapon);
  const weaponIndex = PORTRAIT_WEAPONS.indexOf(weapon?.weapon ?? character?.weapon);
  if (weaponIndex >= 0) layers.push({ slot: 'weapon', item: weapon?.id, index: weaponIndex, order: 12 });
  const shield = itemById(character?.shield);
  const shieldIndex = SHIELDS.indexOf(shield?.type ?? shield?.id);
  if (shieldIndex >= 0) layers.push({ slot: 'shield', item: shield.id, index: 25 + shieldIndex, order: 13 });
  return layers.sort((a, b) => a.order - b.order);
}

/** Enlarge the original equipment figure, without the unused left-hand stats area. */
export async function drawCharacterPortrait(canvas, data, character) {
  const files = portraitFiles(character);
  const [body, faces, equipment, shirt, pants, palette] = await Promise.all([
    data.img(files.body), data.cif(files.faces), data.cif(files.equipment),
    data.img(files.shirt), data.img(files.pants), data.palette('CHARSHT.COL'),
  ]);
  const face = ((Math.trunc(Number(character?.portraitFace)) || 0) % faces.images.length + faces.images.length) % faces.images.length;
  const head = faces.images[face];
  const layers = [
    { image: body, x: 320 - body.width, y: 0, order: 1, opaque: true },
    { image: pants, x: files.pantsPosition[0], y: files.pantsPosition[1], order: 2 },
    { image: head, x: head.xOffset, y: head.yOffset, order: 4 },
    { image: shirt, x: files.shirtPosition[0], y: files.shirtPosition[1], order: 5 },
    ...portraitEquipment(character).map((layer) => {
      const image = equipment.images[layer.index];
      if (!image) throw new Error(`${files.equipment} has no ${layer.slot} image ${layer.index}`);
      return { ...layer, image, x: image.xOffset, y: image.yOffset };
    }),
  ].sort((a, b) => a.order - b.order);
  const cropX = 168;
  canvas.width = 152; canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const layer of layers) {
    const image = layer.image;
    const colors = toRgba(image.indices, palette);
    if (layer.opaque) for (let i = 0; i < colors.length; i += 4) {
      if (image.indices[i / 4] !== 0) continue;
      colors[i] = palette.rgb[0]; colors[i + 1] = palette.rgb[1]; colors[i + 2] = palette.rgb[2]; colors[i + 3] = 255;
    }
    const tile = document.createElement('canvas'); tile.width = image.width; tile.height = image.height;
    tile.getContext('2d').putImageData(new ImageData(colors, image.width, image.height), 0, 0);
    ctx.drawImage(tile, layer.x - cropX, layer.y);
  }
  // Click area remains the uncovered face's own rectangle even when a helm is worn.
  return { files, face, faceCount: faces.images.length, head: { x: head.xOffset - cropX, y: head.yOffset, width: head.width, height: head.height }, equipment: portraitEquipment(character) };
}
