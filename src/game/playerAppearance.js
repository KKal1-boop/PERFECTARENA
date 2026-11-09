// WHAT THE PLAYER LOOKS LIKE — a chosen body, a chosen skin, a chosen head.
//
// The owner, 2026-10-19: *"add to the character creation at the start of the game a visual
// character creation that makes you choose your sprite between all the available npcs sprites
// and lets you change skin and hair color and gives the correct 360 animation + walking+ attack
// animation you chose to your character"*.
//
// Before this, a player's third-person art was a function of their **class** (`game/playerSprite.js`):
// a knight walked as plate, a mage as robes, and nobody could choose to look like the town's own
// people. This module is the catalogue and the law that replaces that one-way mapping.
//
// ## What a sprite is
//
// The install ships twenty-two walkable figures built from five view sheets each:
//
//   * **the town's citizens** — `MLGEN0#W` (a man in a tunic), `MLGEN0#T` (a man in a shirt),
//     `FMGENW0#` (a woman in a blue coat), `FMGEN0#` (a woman in a bodice), `BABE0#` (a woman in
//     a dress), and `GUARD0#` (the watch). The first four carry walk/talk/die sheets; the watch
//     and `BABE` carry Arena's twelve-frame layout (walk 0–5, look 6/7, attack 8–11).
//   * **the armoured roster** — `${sex}${view}${armour}WLK.CFA` for seven armour words
//     (`UNA`, `LTR`, `CHN`, `PLT`, `BAR`, `MAG`, `MNK`) and both sexes. These are the figures the
//     arena's own fighters and guards wear; their strike is `${sex}1${armour}ATT.CFA`.
//   * **the two peoples Arena drew as creatures** — the Lizard Man (`LIZARD1…5`) and the orange
//     wolf (`SWOLF01…05` under `raceSkin.js`'s `khajiitFur`). The owner asked to play as an
//     Argonian or a Khajiit, and these are the install's own bodies for those races; the white
//     snow wolf itself is not offered, only its repainted orange coat.
//
// Every one of them has **five shipped angles**, and Arena's other three directions are mirrors
// of views 4/3/2 (`docs` and `peopleKinds.js`'s header). A player therefore has a real 360: five
// sheets, mirrored on the three back-quarter sides.
//
// ## What the strike is
//
// A citizen's walk sheet has no attack. Arena drew citizens only walking, talking and falling;
// the first pass borrowed the **unarmoured strike of the same sex** (`01UNAATT` / `11UNAATT`), but
// that is a different figure in different clothes — a woman in a blue coat became a stranger in a
// white shirt the moment she swung. The owner's law is exact (2026-11-04): *"if there is no attack
// animation just use the speak one or another but it needs to be the same exact person."* So a
// body with no strike art swings in its **own walk sheet**, under the same palette and the same
// hair entries; the watch, `BABE`, the Lizard Man, the wolf and every armoured figure keep their
// real strike frames. The UI says which is which rather than pretending a tunic has a sword.

import { ARMOUR_SETS } from './playerSprite.js';
import {
  HAIR_COLORS, KHAJIIT_COATS, RACE_SKIN, figureKindFor, khajiitCoatSpec, raceKey, skinSpec,
} from './raceSkin.js';

/** The armour word's file spelling, with the leading sex digit kept separate. */
const SEX_DIGIT = Object.freeze({ male: '0', female: '1' });

/**
 * The install's walkable people, in the order the character creator shows them.
 *
 * `view` is 1…5 (1 faces the viewer, 5 shows the back), and `attack` says how the figure
 * strikes: `same` uses the walk sheet's own Arena layout frames, `walk` uses its ordinary
 * stride when the archive drew no strike, and `other` names a real strike file.
 *
 * @typedef {{id: string, label: string, note: string, gender: 'male'|'female',
 *   walk: (view: number) => string,
 *   attack: {kind: 'same', frames: number[]} | {kind: 'walk', frames: number[]} | {kind: 'other', file: string},
 *   layout: 'view'|'action', paint: 'skin'|'fur'|'own'}} NpcSprite
 *
 * `paint` says how the creator recolours a body: a human takes a race's skin and a hair colour,
 * a wolf takes one of the Khajiit's coats, and the lizard keeps the scales Arena drew. A body
 * whose art is already a people is not a palette trick and must not be painted like one.
 */

/** The citizen families the archive really ships. */
const CITIZENS = Object.freeze([
  {
    id: 'man-tunic', label: 'Man in a tunic', gender: 'male',
    note: 'the town\u2019s own man, `MLGEN0#W` \u2014 walk, talk and fall',
    walk: (view) => `MLGEN0${view}W.CFA`,
    // **No citizen strike exists.** The blow is this same man's own first stride poses, not
    // `01UNAATT`'s bare-chested stranger: a body must never become another person to attack.
    attack: { kind: 'walk', frames: [0, 1, 2, 1] },
    layout: 'action', paint: 'skin',
  },
  {
    id: 'man-shirt', label: 'Man in a shirt', gender: 'male',
    note: 'the second man of the town, `MLGEN0#T`',
    walk: (view) => `MLGEN0${view}T.CFA`,
    attack: { kind: 'walk', frames: [0, 1, 2, 1] },
    layout: 'action', paint: 'skin',
  },
  {
    id: 'woman-coat', label: 'Woman in a blue coat', gender: 'female',
    note: 'the town\u2019s own woman, `FMGENW0#`',
    walk: (view) => `FMGENW0${view}.CFA`,
    // The same woman in the same blue coat; see the man in the tunic above.
    attack: { kind: 'walk', frames: [0, 1, 2, 1] },
    layout: 'action', paint: 'skin',
  },
  {
    id: 'woman-bodice', label: 'Woman in a bodice', gender: 'female',
    note: 'the other woman of the town, `FMGEN0#`',
    walk: (view) => `FMGEN0${view}.CFA`,
    attack: { kind: 'walk', frames: [0, 1, 2, 1] },
    layout: 'action', paint: 'skin',
  },
  {
    id: 'woman-dress', label: 'Woman in a dress', gender: 'female',
    note: 'the blonde figure in a blue dress, `BABE0#` \u2014 with her own sword frames',
    walk: (view) => `BABE0${view}.CFA`,
    attack: { kind: 'same', frames: [8, 9, 10, 11] },
    layout: 'view', paint: 'skin',
  },
  {
    id: 'guard', label: 'Guard of the watch', gender: 'male',
    note: 'the watch, `GUARD0#` \u2014 twelve frames: walk, look and a real strike',
    walk: (view) => `GUARD0${view}.CFA`,
    attack: { kind: 'same', frames: [8, 9, 10, 11] },
    layout: 'view', paint: 'skin',
  },
  // **The two peoples Arena drew as creatures**, offered as bodies the player can be. The
  // owner's own law already stands them in for the races the install never drew (`raceSkin.js`'s
  // `RACE_FIGURE`); the creator must let a player *choose* them rather than only meet them in a
  // province. The wolf and the lizard carry Arena's twelve-frame layout, so their strike is the
  // sheet's own frames 8–11 (`SWOLF01`/`LIZARD1` have 12 frames; the other views have 8 and are
  // stride only, exactly as `peopleKinds.js` measured).
  {
    id: 'lizard-man', label: 'Lizard Man', gender: 'male',
    note: "the marsh's own figure, `LIZARD1\u20265` \u2014 Arena's Lizard Man, whole: scales, stride and strike",
    walk: (view) => `LIZARD${view}.CFA`,
    attack: { kind: 'same', frames: [8, 9, 10, 11] },
    layout: 'view', paint: 'own',
  },
  {
    id: 'cat-folk', label: 'Orange wolf (Khajiit)', gender: 'male',
    note: "the wolf repainted orange with stripes, in any of Elsweyr's coats \u2014 `SWOLF0#` with `khajiitFur`",
    walk: (view) => `SWOLF0${view}.CFA`,
    attack: { kind: 'same', frames: [8, 9, 10, 11] },
    layout: 'view', paint: 'fur',
  },
]);

/**
 * **The bodies this install does not carry.** `11PLTWLK.CFA` — the plate fighter as a woman — is
 * not in `GLOBAL.BSA` (measured 2026-10-19: `01PLTWLK.CFA` is, `11PLTWLK.CFA` is not, and no
 * `11PLTATT.CFA` either). The creator used to list her and hide the blank button only after the
 * archive check ran, which left an empty card in the grid for a body nobody can play. A body the
 * install does not draw is not in the catalogue at all.
 */
const ABSENT_BODIES = new Set([
  'armour-plt-female',
  // **The bare fighter is not offered.** `11UNAWLK.CFA` is Arena's unarmoured woman and the
  // owner's report is exact (2026-11-04): *"if you chose a woman you can see her bare chest and
  // she should use the covered sprite so people can stream the game without this problem"*. A
  // body the creator will not show is not in the catalogue; the covered leather fighter
  // (`armour-ltr-female`) is the unarmoured woman's replacement, and `defaultSpriteFor` sends
  // her there rather than leaving a blank card.
  'armour-una-female',
]);

/** The seven armoured figures, both sexes, from the names the archive really carries. */
const ARMOURED = Object.freeze(ARMOUR_SETS.flatMap((armour) => (['male', 'female'].map((gender) => ({
  id: `armour-${armour.toLowerCase()}-${gender}`,
  label: `${armour === 'UNA' ? 'Unarmoured' : armour} ${gender === 'male' ? 'fighter' : 'fighter (woman)'}`,
  gender,
  note: armour === 'UNA'
    ? 'Arena\u2019s bare-handed fighter, `' + `${SEX_DIGIT[gender]}1UNAWLK` + '`'
    : `Arena\u2019s ${armour.toLowerCase()} armour, \`${SEX_DIGIT[gender]}1${armour}WLK\``,
  walk: (view) => `${SEX_DIGIT[gender]}${view}${armour}WLK.CFA`,
  attack: { kind: 'other', file: `${SEX_DIGIT[gender]}1${armour}ATT.CFA` },
  layout: 'action', paint: 'skin',
})))).filter((sprite) => !ABSENT_BODIES.has(sprite.id)));

/**
 * **Every NPC sprite a player may choose**, in the creator's own order: the town's people
 * first, then the armoured roster. A caller must still check the install (`data.bytes`) before
 * showing one: this is a catalogue of the archive's naming law, not a promise that every file
 * in a partial folder is present.
 *
 * @type {ReadonlyArray<NpcSprite>}
 */
export const NPC_SPRITES = Object.freeze([...CITIZENS, ...ARMOURED]);

/** The sprite with this id, or null. @param {string|null} id @returns {NpcSprite|null} */
export function spriteById(id) {
  return NPC_SPRITES.find((sprite) => sprite.id === id) ?? null;
}

/** The sprite a class wears when the player has not chosen one. */
export function defaultSpriteFor(character) {
  // A race the install draws with its own figure gets that figure before class armour: an
  // Argonian is the Lizard Man and a Khajiit is the repainted wolf, which is the same law the
  // crowd already keeps (`raceSkin.js`'s `RACE_FIGURE`).
  const standIn = figureKindFor(character?.raceId ?? character?.race);
  if (standIn === 'ARGONIAN') return spriteById('lizard-man');
  if (standIn === 'KHAJIIT') return spriteById('cat-folk');
  const armour = String(character?.classId ?? '').toLowerCase();
  const map = {
    acrobat: 'LTR', archer: 'LTR', assassin: 'LTR', barbarian: 'BAR', bard: 'LTR',
    battlemage: 'MAG', burglar: 'LTR', healer: 'MAG', knight: 'PLT', mage: 'MAG', monk: 'MNK',
    nightblade: 'LTR', ranger: 'CHN', rogue: 'LTR', sorceror: 'MAG', spellsword: 'CHN',
    thief: 'LTR', warrior: 'CHN',
  };
  const word = map[armour] ?? 'UNA';
  let gender = character?.gender === 'female' ? 'female' : 'male';
  // The archive really ships no `11PLTWLK.CFA` (measured 2026-10-19), so a woman in plate
  // falls back to the male plate body rather than to a missing sheet. The creator hides the
  // button for any body this install lacks; this is only the default before she chooses.
  if (gender === 'female' && word === 'PLT') gender = 'male';
  // The unarmoured woman's sheet is bare-chested and is not offered; a covered leather body is
  // the same role, and the creator shows it under its own honest label.
  if (gender === 'female' && word === 'UNA') return spriteById('armour-ltr-female') ?? spriteById('woman-coat');
  return spriteById(`armour-${word.toLowerCase()}-${gender}`) ?? spriteById('armour-una-male');
}

/**
 * The player's appearance, normalised. A save from before this feature has none, and gets the
 * class-and-race answer it always had, so no character is ever drawn as a stranger.
 *
 * @param {object|null} appearance
 * @param {object|null} character
 * @returns {{spriteId: string, skin: string|null, hair: string|null, fur: string|null}}
 */
export function normalizeAppearance(appearance, character = null) {
  const sprite = spriteById(appearance?.spriteId) ?? defaultSpriteFor(character);
  const paint = sprite?.paint ?? 'skin';
  const skin = paint === 'skin' && appearance?.skin !== 'arena'
    && typeof appearance?.skin === 'string' && Object.hasOwn(RACE_SKIN, appearance.skin)
    ? appearance.skin : null;
  const hair = paint === 'skin' && typeof appearance?.hair === 'string'
    && Object.hasOwn(HAIR_COLORS, appearance.hair) ? appearance.hair : null;
  // A cat's coat is a choice of its own; the bare `khajiitFur` spec is the tawny the owner
  // named ("make it orange with stripes"), so a cat without a coat is still orange.
  const fur = paint === 'fur'
    ? (typeof appearance?.fur === 'string' && Object.hasOwn(KHAJIIT_COATS, appearance.fur)
      ? appearance.fur : 'tawny')
    : null;
  return { spriteId: sprite?.id ?? 'armour-una-male', skin, hair, fur };
}

/**
 * The skin spec a sheet is painted under: the chosen skin (a race's ramp), the chosen hair, or
 * the character's own race when the creator was never asked.
 *
 * @param {{spriteId?: string, skin?: string|null, hair?: string|null}} appearance
 * @param {object|null} character
 * @returns {string|null} e.g. `darkElf+blonde`, or null for Arena's own palette
 */
export function appearanceSkinSpec(appearance, character = null) {
  const look = normalizeAppearance(appearance, character);
  const sprite = spriteById(look.spriteId);
  // A lizard's scales are already in the sheet, and a wolf's coat is the Khajiit ramp.
  if (sprite?.paint === 'own') return null;
  if (sprite?.paint === 'fur') return khajiitCoatSpec(look.fur);
  const race = look.skin || raceKey(character?.raceId) || raceKey(character?.race) || null;
  return skinSpec(race, look.hair);
}

/**
 * The walk sheet of one chosen sprite at one of the five shipped angles.
 *
 * @param {{spriteId?: string}|string|null} appearance
 * @param {number} view 1…5
 * @param {object|null} [character]
 * @returns {string|null}
 */
export function appearanceWalkFile(appearance, view, character = null) {
  const sprite = spriteById(typeof appearance === 'string' ? appearance : appearance?.spriteId)
    ?? defaultSpriteFor(character);
  if (!sprite) return null;
  const v = Math.max(1, Math.min(5, Math.trunc(Number(view)) || 1));
  return sprite.walk(v);
}

/**
 * The strike art for a chosen sprite.
 *
 * @param {{spriteId?: string}|string|null} appearance
 * @param {object|null} [character]
 * @returns {{file: string, frames: number[]|null, sameSheet: boolean, strike: boolean}|null}
 *   `frames` is the sheet's own Arena layout when `sameSheet`, otherwise null and the whole file
 *   is the blow. `strike` is false only for a body the archive drew with no strike at all; its
 *   `frames` are its own stride poses, kept so the blow is the same person rather than a stranger.
 */
export function appearanceAttack(appearance, character = null) {
  const sprite = spriteById(typeof appearance === 'string' ? appearance : appearance?.spriteId)
    ?? defaultSpriteFor(character);
  if (!sprite) return null;
  if (sprite.attack.kind === 'same') {
    return { file: sprite.walk(1), frames: [...sprite.attack.frames], sameSheet: true, strike: true };
  }
  if (sprite.attack.kind === 'walk') {
    return { file: sprite.walk(1), frames: [...sprite.attack.frames], sameSheet: true, strike: false };
  }
  return { file: sprite.attack.file, frames: null, sameSheet: false, strike: true };
}

/** The eight directions the five shipped views cover, with the mirror flag the renderer uses. */
export const APPEARANCE_VIEWS = Object.freeze([
  { view: 1, mirrored: false }, { view: 2, mirrored: false }, { view: 3, mirrored: false },
  { view: 4, mirrored: false }, { view: 5, mirrored: false },
  { view: 4, mirrored: true }, { view: 3, mirrored: true }, { view: 2, mirrored: true },
]);
