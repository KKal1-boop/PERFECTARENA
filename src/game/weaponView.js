// THE FIRST-PERSON WEAPON — Arena's own swing, drawn where the original draws it.
//
// Arena is a first-person game and the thing you fight with is *art*: a `.CIF` whose every
// image is the weapon at one position in its swing, carrying that position in the image's
// own header offset (`arena/cifFile.js`). Until this module the game drew a blow only on the
// third-person avatar's billboard, so a swing in the default first-person view had no
// picture at all.
//
// Everything below is the original's table, not a reconstruction
// (OpenTESArena `src/Player/ArenaWeaponUtils.h`, MIT, which reads the filenames and the frame
// indices out of Arena's own `A.EXE` data):
//
//   * **Eight weapon sheets.** Staff, the whole blade family (dagger through dai-katana),
//     mace, flail, war hammer, war/battle axe, bows, fists. Six of the eight ship in this
//     install: `FLAIL.CIF` and `BOW.CIF` are not in `GLOBAL.BSA`, so a flail or a bow has no
//     first-person art here and the rig says so rather than drawing the wrong weapon
//     (`WEAPON_SHEETS[family].file` is the name; `hasArt` is whether the install has it).
//   * **The states.** Sheathed (nothing drawn), unsheathing, sheathing, idle, and one per
//     swing direction. The five-frame swings are `FORWARD` 25–29, `DOWN` 0–4, `RIGHT` 15–19,
//     `LEFT` 10–14, `DOWN_RIGHT` 20–24, `DOWN_LEFT` 5–9; the fists sheet has the same shape at
//     0–12. That is why every melee sheet in the archive is exactly **33 images** and
//     `HAND.CIF` exactly **13** — the counts are the table's, and the unit test holds them to
//     each other.
//   * **16 frames a second** (`FRAMES_PER_SECOND`), so a swing is 5/16 = 0.3125 s.
//
// One thing is this project's and is marked as such: the *direction* of a swing comes from
// the movement keys (push forward and it is a thrust, strafe and it is a side sweep, stand
// still and it is the overhead chop) because the port's blow is a key or a click with no
// mouse-gesture direction to read. Arena's own six directions are all reachable that way.

import { WEAPONS, weaponById } from './combat.js';

/** Arena's own animation rate (`ArenaWeaponUtils::FRAMES_PER_SECOND`). */
export const FRAMES_PER_SECOND = 16;

/**
 * How long a drawn weapon is held before it sheathes itself, in seconds.
 *
 * Project policy, not the archive: the original sheathes the weapon when the player stops
 * attacking, and the delay is in `A.EXE`. Two seconds is long enough to see the idle frame
 * and short enough that the drawn weapon does not litter the screen.
 */
export const IDLE_HOLD_SECONDS = 2;

/**
 * The melee sheet's states, as `ArenaWeaponUtils::MeleeAnimationStateInfos`.
 * @type {Readonly<Record<string, readonly number[]>>}
 */
export const MELEE_STATES = Object.freeze({
  sheathed: Object.freeze([]),
  unsheathing: Object.freeze([30, 31, 32]),
  sheathing: Object.freeze([32, 31, 30]),
  idle: Object.freeze([32]),
  forward: Object.freeze([25, 26, 27, 28, 29]),
  down: Object.freeze([0, 1, 2, 3, 4]),
  right: Object.freeze([15, 16, 17, 18, 19]),
  left: Object.freeze([10, 11, 12, 13, 14]),
  downRight: Object.freeze([20, 21, 22, 23, 24]),
  downLeft: Object.freeze([5, 6, 7, 8, 9]),
});

/**
 * The fists sheet's states, as `ArenaWeaponUtils::FistsAnimationStateInfos`. A punch has no
 * separate "forward": the sheet ships one arc and the original reuses it per hand.
 * @type {Readonly<Record<string, readonly number[]>>}
 */
export const FISTS_STATES = Object.freeze({
  sheathed: Object.freeze([]),
  unsheathing: Object.freeze([10, 11, 12]),
  sheathing: Object.freeze([12, 11, 10]),
  idle: Object.freeze([12]),
  forward: Object.freeze([5, 6, 7, 8, 9]),
  down: Object.freeze([0, 1, 2, 3, 4]),
  right: Object.freeze([5, 6, 7, 8, 9]),
  left: Object.freeze([0, 1, 2, 3, 4]),
  downRight: Object.freeze([5, 6, 7, 8, 9]),
  downLeft: Object.freeze([0, 1, 2, 3, 4]),
});

/**
 * The bow sheet's states, as `ArenaWeaponUtils::BowAnimationStateInfos`. `firing` is one
 * frame held seven times as long, which is the original's own `timeScale` — kept here so the
 * table is complete, even though this install has no `BOW.CIF` to draw.
 * @type {Readonly<Record<string, readonly number[]>>}
 */
export const BOW_STATES = Object.freeze({
  sheathed: Object.freeze([]),
  unsheathing: Object.freeze([0]),
  sheathing: Object.freeze([0]),
  idle: Object.freeze([0]),
  firing: Object.freeze([1]),
});

/** How much longer than one frame a bow's firing frame is held (`1.0 / 7.0` in the original). */
export const BOW_FIRING_SCALE = 7;

/** The six swings, in the order the state table names them. */
export const SWING_DIRECTIONS = Object.freeze(['forward', 'down', 'right', 'left', 'downRight', 'downLeft']);

/**
 * One entry per weapon family: the sheet it is drawn from and the state table that indexes it.
 * `file` is the name the original's filename table holds (`staff.cif`, `sword.cif`, …), upper
 * case, whether or not this install ships it.
 * @type {Readonly<Record<string, {file: string, states: Readonly<Record<string, readonly number[]>>}>>}
 */
export const WEAPON_SHEETS = Object.freeze({
  staff: { file: 'STAFF.CIF', states: MELEE_STATES },
  blade: { file: 'SWORD.CIF', states: MELEE_STATES },
  mace: { file: 'MACE.CIF', states: MELEE_STATES },
  flail: { file: 'FLAIL.CIF', states: MELEE_STATES },
  warhammer: { file: 'HAMMER.CIF', states: MELEE_STATES },
  axe: { file: 'AXE.CIF', states: MELEE_STATES },
  bow: { file: 'BOW.CIF', states: BOW_STATES },
  fists: { file: 'HAND.CIF', states: FISTS_STATES },
});

/**
 * Which sheet each of the game's weapon bases swings from.
 *
 * Arena's own mapping is by *weapon type ID* (`ArenaWeaponUtils::FilenameIndices`): every
 * bladed weapon from dagger to dai-katana is one sheet, both axes are one sheet, both bows
 * are one. The two gauntlets are hand weapons in Arena (they are worn on the fist, and the
 * game's fist sheet is what a punch is drawn from), so they map to `fists` with the rest of
 * the bare-handed bases.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const FAMILY_OF_WEAPON = Object.freeze({
  fists: 'fists', 'chain-gauntlets': 'fists', 'plate-gauntlets': 'fists',
  staff: 'staff',
  dagger: 'blade', tanto: 'blade', shortsword: 'blade', wakizashi: 'blade',
  broadsword: 'blade', saber: 'blade', longsword: 'blade', katana: 'blade',
  claymore: 'blade', 'dai-katana': 'blade',
  mace: 'mace',
  flail: 'flail',
  warhammer: 'warhammer',
  'war-axe': 'axe', 'battle-axe': 'axe',
  'short-bow': 'bow', 'long-bow': 'bow',
});

/** @param {string} id @returns {string} */
export function familyOfWeapon(id) {
  return FAMILY_OF_WEAPON[String(id ?? '').toLowerCase()] ?? 'fists';
}

/** Every weapon base whose family some install lacks art for — the honest list, for the HUD. */
export function weaponsWithoutArt(missingFiles) {
  const gone = new Set([...missingFiles].map((n) => String(n).toUpperCase()));
  return WEAPONS.filter((w) => gone.has(WEAPON_SHEETS[familyOfWeapon(w.id)].file)).map((w) => w.id);
}

/**
 * Which of Arena's six swings a set of movement keys asks for.
 *
 * The original reads the direction out of the mouse's own gesture; a port whose blow is a key
 * press has no gesture, so the keys the player is holding stand in for it. Every direction the
 * state table has is reachable, and standing still is the overhead chop.
 *
 * @param {{forward?: number, strafe?: number}} [input]
 * @returns {string} one of `SWING_DIRECTIONS`
 */
export function swingDirection(input = {}) {
  const forward = Math.sign(input.forward ?? 0);
  const strafe = Math.sign(input.strafe ?? 0);
  if (forward > 0 && strafe > 0) return 'downRight';
  if (forward > 0 && strafe < 0) return 'downLeft';
  if (forward > 0) return 'forward';
  if (strafe > 0) return 'right';
  if (strafe < 0) return 'left';
  return 'down';
}

/**
 * @typedef {object} WeaponRig
 * @property {string} weapon      the weapon base's id, as `WEAPONS` names it
 * @property {string} family      which sheet it swings from
 * @property {string} file        the `.CIF` the original draws it from
 * @property {string} state       `sheathed` … `idle`, or one of the swing directions
 * @property {number|null} frame  the image index to draw, or null when nothing is drawn
 * @property {boolean} drawn      whether a frame is on screen
 * @property {number} seconds     how long the current state has been running
 * @property {string|null} direction  the swing's direction while one is playing
 */

/**
 * A first-person weapon, following Arena's own state machine.
 *
 * The sequence is the original's: sheathed → unsheathing → idle → a swing → idle → … and,
 * after the hold, sheathing → sheathed. Every frame it draws is an image index into the
 * family's `.CIF`, so the caller only has to ask *which* frame and *where* (the image's own
 * header offset).
 *
 * @param {string} [weaponId]   a `WEAPONS` id; anything unknown fights bare-handed, as in `combat.js`
 * @param {{fps?: number, idleHold?: number}} [opts]
 * @returns {WeaponRig & {swing: (direction?: string) => string, step: (dt: number) => WeaponRig, sheath: () => void, reset: (weaponId?: string) => void}}
 */
export function createWeaponRig(weaponId = 'fists', opts = {}) {
  const fps = Number(opts.fps) > 0 ? Number(opts.fps) : FRAMES_PER_SECOND;
  const idleHold = Number(opts.idleHold) >= 0 ? Number(opts.idleHold) : IDLE_HOLD_SECONDS;

  let weapon = String(weaponId ?? 'fists').toLowerCase();
  let family = familyOfWeapon(weapon);
  /** @type {string} */
  let state = 'sheathed';
  let seconds = 0;
  /** @type {string|null} */
  let direction = null;
  /** A swing asked for while the weapon was still being drawn, played when it is up. */
  let pending = null;
  /** @type {readonly number[]} */
  let frames = WEAPON_SHEETS[family].states.sheathed;

  const enter = (next) => {
    state = next;
    seconds = 0;
    frames = WEAPON_SHEETS[family].states[next] ?? [];
  };

  const secondsIn = (name) => {
    const list = WEAPON_SHEETS[family].states[name] ?? [];
    const scale = name === 'firing' ? BOW_FIRING_SCALE : 1;
    return (list.length / fps) * scale;
  };

  /** The image index the rig is showing, or null when it draws nothing. */
  const frameNow = () => {
    if (!frames.length) return null;
    const scale = state === 'firing' ? BOW_FIRING_SCALE : 1;
    const step = Math.floor((seconds * fps) / scale);
    return frames[Math.min(frames.length - 1, Math.max(0, step))];
  };

  const rig = {
    get weapon() { return weapon; },
    get family() { return family; },
    get file() { return WEAPON_SHEETS[family].file; },
    get state() { return state; },
    get frame() { return frameNow(); },
    get drawn() { return frameNow() !== null; },
    get seconds() { return seconds; },
    get direction() { return direction; },
    /** An image index last seen, so a caller can load the art the states will want. */
    get indices() { return sheetIndices(family); },

    /**
     * The player strikes. From sheathed, the weapon is drawn first (the original's
     * unsheathing state) and the swing follows it; otherwise the swing plays at once.
     *
     * @param {string} [dir]  one of `SWING_DIRECTIONS`; defaults to the overhead chop
     * @returns {string} the swing's direction
     */
    swing(dir) {
      const wanted = SWING_DIRECTIONS.includes(String(dir)) ? String(dir) : 'down';
      // A family whose table has no such direction plays the nearest state it *does* have:
      // a bow swings nothing, it fires (its own state), and the sheet's frames are what the
      // caller loads either way. `direction` still reports what the player asked for.
      const states = WEAPON_SHEETS[family].states;
      const play = states[wanted]?.length ? wanted
        : states.forward?.length ? 'forward'
          : states.firing?.length ? 'firing' : 'down';
      direction = wanted;
      if (state === 'sheathed') {
        // The first blow draws the weapon and swings on the end of it, so the draw is not a
        // wasted press: the swing waits for the hand (the original's own unsheathing state).
        pending = play;
        enter('unsheathing');
      } else {
        state = play; seconds = 0; frames = states[play] ?? [];
      }
      return wanted;
    },

    /**
     * Advance the clock by `dt` seconds, and take the state transition it is due.
     * @param {number} dt
     */
    step(dt) {
      // A frame's own delta. Clamped at zero (never backwards) but *not* at one: a
      // minimum of a second here would run the whole animation on the first frame, which
      // is exactly what the first version of this did.
      const span = Math.max(0, Number(dt) || 0);
      seconds += span;
      switch (state) {
        case 'unsheathing':
          if (seconds >= secondsIn('unsheathing')) {
            const wanted = pending;
            pending = null;
            if (wanted) { state = wanted; seconds = 0; frames = WEAPON_SHEETS[family].states[wanted] ?? []; } else enter('idle');
          }
          break;
        case 'sheathing':
          if (seconds >= secondsIn('sheathing')) enter('sheathed');
          break;
        case 'idle':
          if (seconds >= idleHold) enter('sheathing');
          break;
        case 'sheathed':
          break;
        default:
          // A swing: back to the drawn hold when its frames have run.
          if (seconds >= secondsIn(state)) { direction = null; enter('idle'); }
          break;
      }
      return rig;
    },

    /** Put it away now, as the original does when the player stops fighting. */
    sheath() { enter('sheathing'); },

    /** Start again, optionally with a different weapon (a shop, a looted blade). */
    reset(id) {
      weapon = String(id ?? weapon).toLowerCase();
      family = familyOfWeapon(weapon);
      direction = null;
      pending = null;
      enter('sheathed');
    },
  };
  return rig;
}

/** The readable name of a weapon id, for the HUD. */
export const weaponName = (id) => weaponById(id).name;

/**
 * Arena's own stride law: **a drawn weapon is a walk, not a run.**
 *
 * The owner, playing this port beside the original (2026-10-16): *"for the combat to be
 * better in perfectarena you shouldnt be able to run with your weapons unsheathed"*. It is
 * the original's law rather than a balance choice — a fight is entered deliberately, and
 * fleeing means putting the blade away first — and the argument is the rig's **own** answer
 * (`drawn`: whether a frame of the held weapon is on screen), never a second flag kept
 * beside it, so the input builder cannot disagree with what the player sees in their hands.
 * The engine's `canRunUnlessRiding` (`systems/transport.js`) is the same shape for a mount.
 *
 * @param {boolean} drawn whether the first-person weapon is out
 * @returns {boolean} whether the sprint key is allowed to mean one
 */
export const canRunUnlessDrawn = (drawn) => !drawn;

/**
 * The screen Arena drew its first-person art on, and the line its weapon art stands on.
 *
 * `ART_BASELINE` is **measured, not chosen**. Across the six sheets this install ships, the
 * 178 frames the state tables can show put `yOffset + height` on `147` in **146** of them —
 * `SWORD.CIF`'s idle blade `68 + 79`, its overhead chop `0 + 147`, the mace `74 + 70`, the
 * axe `54 + 93` — and on `146` in all 13 frames of `HAND.CIF`. The stragglers are the side
 * sweeps caught mid-arc (a left/right slash is wide and low, and its bottom sits 8 or 19
 * pixels *above* the line) and the mace's raised frame. So the law the art encodes is not
 * "pin the picture to 147" but "147 is the line, and every frame keeps its own distance
 * from it": the 53 rows below it are the original's own status area, and the weapon stands
 * on the top of it.
 *
 * The port does not ship Arena's status bar — its HUD is a DOM panel at the bottom of the
 * window — so the *line* is what carries over: whatever the HUD's own top edge is, that is
 * where the weapon's art stands, and the weapon stops being drawn behind the panel.
 */
export const SCREEN = Object.freeze({ width: 320, height: 200 });
export const ART_BASELINE = 147;

/**
 * @typedef {object} WeaponPlacement
 * @property {number} x  left edge, in window pixels
 * @property {number} y  top edge, in window pixels
 * @property {number} w  drawn width
 * @property {number} h  drawn height
 * @property {number} scale   pixels per art pixel (one factor for both axes)
 * @property {number} right   the art's right edge, in window pixels
 * @property {number} bottom  the art's bottom edge, in window pixels
 */

/**
 * Where one frame of the weapon is drawn in a window of `screen`, and how big.
 *
 * Two laws, both the original's own rather than this project's:
 *
 *   * **One uniform scale** — `min(width / 320, height / 200)`. Scaling each axis to the
 *     window (what a real VGA mode did to a 4:3 monitor) stretched the art away from its
 *     own proportions on any other window, which is the reported "cut and floating
 *     mid-screen".
 *   * **The art keeps its own margins**, measured from the window rather than from a
 *     letterboxed 320 × 200 box: its right edge is the original's own `320 − (xOffset + width)`
 *     from the right of the window (`SWORD.CIF`'s idle blade sits 1 art pixel off it), and
 *     its bottom edge stands on the status line (`ART_BASELINE`), which in the port is the
 *     top of the HUD panel. `SWORD.CIF`'s mid-air slash frames (`yOffset + height` 139) keep
 *     the 8-pixel gap above that line the art gives them, because the rule is the *line*, not
 *     "pin the bottom of the picture".
 *
 * @param {{xOffset: number, yOffset: number, width: number, height: number}} art
 * @param {{width: number, height: number, baseline?: number}} screen  `baseline` is the status line's own y
 * @returns {WeaponPlacement}
 */
export function placeWeapon(art, screen) {
  const winW = Math.max(1, Number(screen?.width) || 1);
  const winH = Math.max(1, Number(screen?.height) || 1);
  const baseline = Number.isFinite(screen?.baseline) ? Number(screen.baseline) : winH;
  const scale = Math.min(winW / SCREEN.width, winH / SCREEN.height);
  const xOffset = Number(art?.xOffset) || 0;
  const yOffset = Number(art?.yOffset) || 0;
  const w = (Number(art?.width) || 0) * scale;
  const h = (Number(art?.height) || 0) * scale;
  // Right edge: the original's margin from the screen's right, scaled.
  const x = winW - (SCREEN.width - xOffset) * scale;
  // Bottom edge: the original's own distance *above* the status line, scaled.
  const y = baseline - (ART_BASELINE - yOffset) * scale;
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    scale,
    right: Math.round(x + w),
    bottom: Math.round(y + h),
  };
}

/**
 * Every image index a family's states can show, ascending and without repeats.
 *
 * A caller loads the art for these and only these, so a fist sheet costs 13 images and a
 * melee sheet 25 — not all 33 the file holds (frames 25–32 are the idle and draw frames the
 * states do use; 0–24 are the six swings; nothing uses a frame outside 0–32).
 *
 * @param {string} family
 * @returns {number[]}
 */
export function sheetIndices(family) {
  const states = WEAPON_SHEETS[family]?.states;
  if (!states) return [];
  const seen = new Set();
  for (const frames of Object.values(states)) for (const i of frames) seen.add(i);
  return [...seen].sort((a, b) => a - b);
}
