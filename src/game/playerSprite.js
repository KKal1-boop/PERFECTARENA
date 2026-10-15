// WHAT THE PLAYER LOOKS LIKE FROM BEHIND.
//
// Arena draws its own people — townsfolk, guards and the player — from the same `.CFA`
// family the monsters use, and the file name says exactly who is in it:
//
//   `<view><armour><action>.CFA`   e.g. `05PLTWLK.CFA`, `01BARATT.CFA`
//
// The middle three letters name what the figure is **wearing**, and the archive spells
// seven of them: `UNA` unarmoured, `LTR` leather, `CHN` chain, `PLT` plate, `BAR`
// barbarian, `MAG` a mage's robes, `MNK` a monk's habit. The trailing three are the
// action — `WLK`, `ATT`, `BOW`, `SPL`, `KIC`.
//
// The leading two digits are the **view**: `01`…`05` of every armour-and-walk
// combination are the *same figure at five angles*, not five different people. Rendered
// side by side, `01PLTWLK` is the knight facing the viewer, `02` and `03` are turned away
// through a quarter and a profile, and `04`/`05` are the three-quarter-back and the back;
// the widths agree with that reading (the straight-on front is 52 px and the straight-on
// back 53, where the profile is the widest at 66). The other side of each angle comes
// from mirroring the billboard, which is why Arena ships five and not eight.
//
// So a character's third-person sprite follows from their class: Arena's classes each
// describe what they wear (`character.js`), and the mapping below is that reading. The
// **action** is picked per use and the **view** follows from where the camera is: standing
// behind the player it looks at the back of the figure, so the walk uses `05`. Only `01`
// carries the actions a figure performs facing forward (`01PLTATT.CFA` exists and
// `05PLTATT.CFA` does not), so the swing keeps the one angle the archive has.

/** The five views the archive ships per armour-and-walk combination. */
export const VIEW_COUNT = 5;

/** The view a camera standing behind the figure looks at: the back, `05`. */
export const BACK_VIEW = 5;

/** The armour writings the archive ships, most-armoured first in the tables below. */
export const ARMOUR_SETS = Object.freeze(['UNA', 'LTR', 'CHN', 'PLT', 'BAR', 'MAG', 'MNK']);

/**
 * Which armour file each of Arena's eighteen classes walks in.
 *
 * The classes that are defined by their armour get theirs; the fighting generalists get
 * the unarmoured figure, which is the one figure that can hold any weapon.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const CLASS_ARMOUR = Object.freeze({
  acrobat: 'LTR',
  archer: 'LTR',
  assassin: 'LTR',
  barbarian: 'BAR',
  bard: 'LTR',
  battlemage: 'MAG',
  burglar: 'LTR',
  healer: 'MAG',
  knight: 'PLT',
  mage: 'MAG',
  monk: 'MNK',
  nightblade: 'LTR',
  ranger: 'CHN',
  rogue: 'LTR',
  sorceror: 'MAG',
  spellsword: 'CHN',
  thief: 'LTR',
  warrior: 'CHN',
});

/**
 * The `.CFA` a character is drawn from.
 *
 * @param {object} character  a character from `game/character.js`, or anything with a `classId`
 * @param {'WLK'|'ATT'|'BOW'|'SPL'|'KIC'} [action]
 * @param {number} [view]     1…5, the angle the figure is seen from; 5 is the back
 * @returns {string} e.g. `05PLTWLK.CFA`; the unarmoured walker when the class is unknown
 */
export function playerSpriteFile(character, action = 'WLK', view = BACK_VIEW) {
  const armour = CLASS_ARMOUR[String(character?.classId ?? '').toLowerCase()] ?? 'UNA';
  const act = ['WLK', 'ATT', 'BOW', 'SPL', 'KIC'].includes(action) ? action : 'WLK';
  const two = String(Math.max(1, Math.min(5, Math.trunc(view)))).padStart(2, '0');
  return `${two}${armour}${act}.CFA`;
}

/**
 * The walk and attack files a character needs, for a caller that uploads both.
 *
 * The attack action only ships as view `01`, so that is what this asks for: Arena
 * dropped the other four angles for the actions a figure only performs facing forward.
 *
 * @param {object} character
 * @returns {string[]} `[walk from behind, attack]`
 */
export function playerSpriteFiles(character) {
  return [playerSpriteFile(character, 'WLK', BACK_VIEW), playerSpriteFile(character, 'ATT', 1)];
}
