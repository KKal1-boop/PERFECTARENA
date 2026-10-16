// Per-actor animation, independent of outfits, render batches, and camera turns.
// Arena enemy layout: ArenaAnimUtils.h/.cpp (OpenTESArena, MIT): views 1–5 contain
// walk 0..5, look 6/0/7/0, attack 8..11 in view 1; file 6 is DEATH, not attack.
// https://github.com/afritz1/OpenTESArena/blob/main/OpenTESArena/src/Entities/ArenaAnimUtils.h
export const ENEMY_WALK_FRAMES = 6;
/**
 * The frames a stride uses on a sheet that carries Arena's **layout**: walk 0–5, look 6/0/7/0,
 * attack 8–11 (`ArenaAnimUtils`: view 1 holds walk 0..5, the look poses at 6 and 7, and the attack
 * at 8..11).
 *
 * **Six is a fact about the sheet, not about who is wearing it.** For years this file asked the
 * *actor* (`enemy: Boolean(actor.monster)`) and gave everybody else `count` — every frame the file
 * happens to hold — so the town's **watch** (`GUARD01.CFA`…, twelve frames: the five angles and
 * the death, read by `peopleKinds.js`) walked through its head-turns and its sword-swings, and so
 * did the `BABE` family. Measured off the archive: the armoured folk and the town's men and women
 * carry **6 or 9-frame action sheets** (one animation each, no layout), and the five-angle
 * families carry **12**. So the layout is read from the sheet, and the caller says which it is.
 */
export const LAYOUT_WALK_FRAMES = 6;
export const ENEMY_ATTACK_FRAMES = Object.freeze([8, 9, 10, 11]);
export const ENEMY_DEATH_FRAME_SECONDS = 1 / 12;

/**
 * Metres of travel a creature's heading is averaged over.
 *
 * **A single frame's displacement is not a heading.** The scene moves a creature the way
 * Arena's own maps do — one axis at a time, each tested against the walls on its own
 * (`interior.js`'s `stepMonsters`: `if (walkableWorld(nx, z)) x = nx; if (walkableWorld(x, nz)) z = nz;`)
 * — so a diagonal approach that clips anything on one axis advances along the **other** one
 * that frame, and the frame's displacement is `(dx, 0)` on one frame and `(0, dz)` on the
 * next. Read from a single frame, that yaw swings a quarter turn back and forth every frame,
 * and the billboard's mirrored flag with it: the owner's report, played side by side with the
 * original (2026-10-16) — "ENEMIES FLIP LEFT AND RIGHT FOR NO REASON WHEN THEY MOVE".
 * Measured with `.scratch/flipprobe.mjs`, one monster closing on a still player with one axis
 * refused per frame: **258 mirror flips in 300 frames** before this, and 1 after (the one
 * real flip, when it walks past the player's own axis).
 *
 * Minus thirty centimetres is a little over a tenth of a second at a walk (1.67 m/s), which is
 * short enough that a creature still turns where the player can see it turn.
 */
export const FACING_METRES = 0.3;

/**
 * Step one actor's animation, and its heading with it.
 *
 * @param {{world: {x: number, z: number}, motion?: object, facing?: number, walking?: boolean, monster?: unknown}} actor
 * @param {{cycleMetres?: number, maxStep?: number, facingMetres?: number}} [opts]
 * @returns {object} the actor's motion state
 */
export function stepActorAnimation(actor, { cycleMetres = 2.5, maxStep = 1, facingMetres = FACING_METRES } = {}) {
  const { x, z } = actor.world;
  const state = actor.motion ??= { x, z, metres: 0, moving: false };
  const dx = x - state.x, dz = z - state.z;
  const distance = Math.hypot(dx, dz);
  state.x = x;
  state.z = z;
  state.moving = distance > 0.0001 && distance <= maxStep;
  if (state.moving) {
    state.metres = (state.metres + distance) % cycleMetres;
    // The heading, taken from the travel accumulated since the last one rather than from this
    // frame's own axis — see `FACING_METRES`.
    const aim = state.aim ??= { x: 0, z: 0 };
    aim.x += dx;
    aim.z += dz;
    if (Math.hypot(aim.x, aim.z) >= facingMetres) {
      actor.facing = Math.atan2(aim.x, aim.z);
      aim.x = 0;
      aim.z = 0;
    }
  }
  actor.walking = state.moving;
  return state;
}

export function actorFrame(actor, frameCount, { cycleMetres = 2.5, attack = null, enemy = Boolean(actor.monster), walkFrames = null } = {}) {
  const count = Math.max(1, frameCount | 0);
  if (actor.death) {
    return Math.min(count - 1, Math.floor(Math.max(0, actor.death.elapsed) / ENEMY_DEATH_FRAME_SECONDS));
  }
  if (attack) {
    const p = attack.profile, t = attack.elapsed;
    // For original enemy sheets, hold anticipation poses during windup, then play the
    // impact poses on the active phase. Never sample look, walk, or death frames here.
    const progress = t < p.windup ? 0.5 * t / p.windup
      : t < p.windup + p.active ? 0.5 + 0.5 * (t - p.windup) / p.active : 1;
    const frames = enemy ? ENEMY_ATTACK_FRAMES.filter((frame) => frame < count) : Array.from({ length: count }, (_, i) => i);
    if (!frames.length) return 0; // Missing action art holds idle rather than playing death.
    return frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))];
  }
  if (!actor.motion?.moving) return 0;
  // **The sheet says how long a stride is.** `walkFrames` is the caller's reading of the art (a
  // twelve-frame view sheet strides on its first six, `LAYOUT_WALK_FRAMES`); with none given, the
  // old rule stands — a creature's sheet is the layout, and every other sheet is one animation.
  const wanted = Number.isFinite(walkFrames) && walkFrames > 0
    ? walkFrames
    : (enemy ? ENEMY_WALK_FRAMES : count);
  const walkCount = Math.max(1, Math.min(count, Math.trunc(wanted)));
  return Math.floor(actor.motion.metres / cycleMetres * walkCount) % walkCount;
}

// Choose the camera-relative left/right half independently of the five view files.
// Arena's opposite sides use reflected views 4, 3, 2 rather than different artwork.
export function actorMirrored(facing, x, z, eyeX, eyeZ) {
  const angle = Math.atan2(eyeX - x, eyeZ - z) - facing;
  return Math.sin(angle) < 0;
}

/**
 * How far off the eye's own axis a billboard must be before its side is decided again.
 *
 * **A creature walking straight at the player has no side.** The mirrored half is a property
 * of the *angle* between a person's heading and the line to the eye, and `sin` of that angle is
 * zero when the two agree — so a creature closing head-on (or walking directly away) sits on a
 * knife edge, and the arithmetic of a stepped approach crosses it back and forth frame after
 * frame. That is the second half of the owner's report (2026-10-16): the heading itself was
 * fixed by averaging it over travel (`FACING_METRES`), which took the sharp turns from 259 to
 * 1, and the mirrored flag still flickered **238 times in 300 frames** — measured with
 * `.scratch/flipprobe.mjs` — because a near-zero sine needs no noise at all to change sign.
 *
 * A fifth of a radian is about eleven degrees: inside it a billboard keeps the side it last
 * had, so the front and rear views are stable, and outside it a creature passing the player's
 * shoulder turns over once, as it should.
 */
export const MIRROR_DEADBAND = 0.2;

/**
 * Which side of a creature the eye is on — decided with a deadband, and remembered on the
 * actor (`actor.mirrorSide`) so a knife-edge cannot flicker.
 *
 * @param {{world: {x: number, z: number}, facing?: number, mirrorSide?: boolean}} actor
 * @param {number} eyeX @param {number} eyeZ
 * @param {number} [deadband]
 * @returns {boolean}
 */
export function mirrorFor(actor, eyeX, eyeZ, deadband = MIRROR_DEADBAND) {
  const side = Math.sin(Math.atan2(eyeX - actor.world.x, eyeZ - actor.world.z) - (actor.facing ?? 0));
  if (actor.mirrorSide === undefined || Math.abs(side) >= deadband) actor.mirrorSide = side < 0;
  return actor.mirrorSide;
}
