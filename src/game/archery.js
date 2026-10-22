// ARCHERY — the player's own missile, and the one weapon family this port could not use.
//
// Arena's bows are weapons like any other: the damage is the base's own range crossed with the
// metal (`game/combat.js`'s `WEAPONS`/`MATERIALS` — a short bow 2–8, a long bow 2–12, plus the
// material's two ends), the roll to hit is the fight's own, and what the bow adds is **range**.
// Until this module the port had no ranged player attack at all: `Z`-cast spells flew, a
// monster's bolt flew (`game/ranged.js`), and a bow was a club — `resolveAttack` at
// `combat.js`'s melee reach, drawn with no picture, because `BOW.CIF` is not in this install's
// `GLOBAL.BSA` (measured: `AXE`, `HAMMER`, `HAND`, `MACE`, `STAFF`, `SWORD` ship; `BOW` and
// `FLAIL` do not). A player who bought a long bow owned a very expensive stick.
//
// This module is the arrow's **flight**, and nothing else: where it starts, which way it goes,
// what it does when it meets stone, and whether it is inside a creature's body. The wound is
// dealt by `combat.js`'s `resolveAttack` when it lands, so a bow's hit chance, a silver arrow
// against a vampire and an iron arrow against an iron golem all answer exactly as a sword's do
// — one law for the fight, not two.
//
// ## What is Arena's and what is this project's
//
//   * **Arena's:** that a bow is a ranged weapon at all, and the base damage ranges and the
//     material modifiers (UESP's weapon table, already in `combat.js`). The install does ship
//     missile art — `ARROWS.CIF`, nine 12×9 frames — but that is a **screen** sprite (Arena
//     drew the arrow from the first person), not a world body, so it is not what this module
//     draws.
//   * **This project's, and marked as such:** the speed, the flight time, the hit radius, the
//     drop, and the world-space shaft `CombatFx` draws for a shot in the air (`ARROW_SHAFT`).
//     Arena's arrow ballistics live inside `A.EXE` (DECISIONS.md D11) and are not in this
//     checkout. They are chosen here once, in the open, and they are *flat enough to aim*: an
//     arrow is a straight shot over a room, because a port whose arrows drop out of a
//     corridor's ceiling is a port whose bow is not usable in the place Arena fights in.
//
// Nothing here reads the world: the scene owns the walls and the creatures, and hands them in
// as two predicates. That is the same discipline as `ranged.js`, and it is what makes the
// flight testable without a browser.

/** A bow's base ids, from `combat.js`'s own table. */
export const BOW_IDS = Object.freeze(['short-bow', 'long-bow']);

/**
 * Is this weapon a bow? Anything that is not is a melee weapon, exactly as before.
 * @param {string|null} weaponId
 * @returns {boolean}
 */
export function isBow(weaponId) {
  return BOW_IDS.includes(String(weaponId ?? '').toLowerCase());
}

/**
 * The arrow's speed in metres a second.
 *
 * **RECONSTRUCTED.** Fast enough that a shot across a hall is a shot and not a balloon —
 * Arena's own figure is in `A.EXE` — and slow enough that the eye can follow the shaft. 26 m/s
 * crosses the game's own longest interior sight (about 30 m) in a little over a second.
 */
export const ARROW_SPEED = 26;

/** How long an arrow lives, in seconds. **RECONSTRUCTED** with `ARROW_SPEED`. */
export const ARROW_LIFE = 1.8;

/**
 * How close an arrow must pass to a creature's body to be *in* it, in metres.
 *
 * The body is the same standing cylinder the player's own bolt test uses
 * (`ranged.js`'s `BOLT_HIT_RADIUS`), a little wider because an arrow is a shaft crossing the
 * space in one frame rather than a slow spark: at 26 m/s and a 60th of a second a step is
 * 0.43 m, so a smaller radius would let a shaft pass through a ribcage between two frames.
 */
export const ARROW_RADIUS = 0.55;

/**
 * How far the arrow falls per second of flight, in metres — **RECONSTRUCTED**, and small.
 *
 * A straight shot is what makes a bow usable in a corridor; the drop is here so a shot at the
 * far end of a long hall still reads as an arrow and not a laser. It is a constant
 * acceleration, not a drag model.
 */
export const ARROW_DROP = 1.6;

/**
 * @typedef {object} Arrow
 * @property {number} x @property {number} y @property {number} z  the tip, world units
 * @property {number} vx @property {number} vy @property {number} vz  metres a second
 * @property {number} life  seconds left
 * @property {string} weapon   the bow's base id, for the wound's own roll
 * @property {string|null} material
 */

/**
 * Loose an arrow from the player's eye along an aim.
 *
 * The arrow's wound is **not** rolled here: `weapon` and `material` travel with it so the
 * fight rolls the same blow a sword would, at the moment it lands and against the creature it
 * lands on (`combat.js`'s `resolveAttack` reads the defender's immunity and resistances).
 *
 * @param {{from: {x: number, y: number, z: number}, aim: {x: number, y: number, z: number},
 *   weapon?: string, material?: string|null}} opts
 * @returns {Arrow}
 */
export function looseArrow({ from, aim, weapon = 'short-bow', material = null } = {}) {
  const ax = Number(aim?.x) || 0;
  const ay = Number(aim?.y) || 0;
  const az = Number(aim?.z) || 0;
  const length = Math.hypot(ax, ay, az) || 1;
  return {
    x: Number(from?.x) || 0,
    y: Number(from?.y) || 0,
    z: Number(from?.z) || 0,
    vx: (ax / length) * ARROW_SPEED,
    vy: (ay / length) * ARROW_SPEED,
    vz: (az / length) * ARROW_SPEED,
    life: ARROW_LIFE,
    weapon: String(weapon),
    material: material ? String(material) : null,
  };
}

/**
 * One frame of an arrow's flight.
 *
 * The passage is the **segment** the arrow is about to fly, not the cell it lands in, so a
 * shaft skimming a doorway is not eaten by a rounding — the same reasoning `ranged.js`'s
 * `stepBolt` records for a bolt.
 *
 * @param {Arrow} arrow  mutated in place
 * @param {number} dt
 * @param {(x: number, y: number, z: number) => boolean} solidAt  the caller's walls
 * @returns {{dead: boolean, wallhit: boolean}}
 */
export function stepArrow(arrow, dt, solidAt) {
  const span = Math.max(0, Number(dt) || 0);
  // The drop is applied to the *climb*, not to a drawn arc: the arrow still travels the way it
  // was aimed, and gravity bends it as it goes (`ARROW_DROP`).
  arrow.vy -= ARROW_DROP * span;
  const x = arrow.x + arrow.vx * span;
  const y = arrow.y + arrow.vy * span;
  const z = arrow.z + arrow.vz * span;
  if (solidAt(x, y, z)) {
    arrow.life = 0;
    return { dead: true, wallhit: true };
  }
  arrow.x = x;
  arrow.y = y;
  arrow.z = z;
  arrow.life -= span;
  return { dead: arrow.life <= 0, wallhit: false };
}

/**
 * Is the arrow inside this creature's standing body?
 *
 * The body is a cylinder about its feet: the horizontal circle is `ARROW_RADIUS`, the vertical
 * span is a person's height (the same 1.9 m the player's own capsule uses), so an arrow that
 * passes over a rat's back misses it and one that passes through a golem's chest does not.
 *
 * @param {Arrow} arrow
 * @param {{x: number, y: number, z: number, height?: number}} body  the creature's feet
 * @returns {boolean}
 */
export function arrowAtMonster(arrow, body) {
  if (!arrow || !body) return false;
  const horizontal = Math.hypot(arrow.x - body.x, arrow.z - body.z);
  if (horizontal > ARROW_RADIUS) return false;
  const height = Number(body.height) > 0 ? Number(body.height) : 1.9;
  return arrow.y >= body.y - 0.15 && arrow.y <= body.y + height;
}

/**
 * Which way an arrow should be aimed, from a camera's yaw and pitch.
 *
 * The scene's camera is yaw-only (`cam.yaw` turns, and the crosshair is the horizon), so the
 * port's own arrow is aimed level and the *drop* is what puts it below the crosshair at range.
 * A caller that later grows a pitch passes one and nothing here changes: this is the one place
 * the aim is built from angles.
 *
 * @param {number} yaw    radians, the camera's own (`sin` forward, `cos` forward)
 * @param {number} [pitch]  radians, positive up; 0 by default
 * @returns {{x: number, y: number, z: number}} a unit vector
 */
export function aimFromAngles(yaw, pitch = 0) {
  const p = Number(pitch) || 0;
  const flat = Math.cos(p);
  return { x: Math.sin(yaw) * flat, y: Math.sin(p), z: Math.cos(yaw) * flat };
}
