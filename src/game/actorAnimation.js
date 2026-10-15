// Per-actor animation, independent of outfits, render batches, and camera turns.
// Arena enemy layout: ArenaAnimUtils.h/.cpp (OpenTESArena, MIT): views 1–5 contain
// walk 0..5, look 6/0/7/0, attack 8..11 in view 1; file 6 is DEATH, not attack.
// https://github.com/afritz1/OpenTESArena/blob/main/OpenTESArena/src/Entities/ArenaAnimUtils.h
export const ENEMY_WALK_FRAMES = 6;
export const ENEMY_ATTACK_FRAMES = Object.freeze([8, 9, 10, 11]);
export const ENEMY_DEATH_FRAME_SECONDS = 1 / 12;

export function stepActorAnimation(actor, { cycleMetres = 2.5, maxStep = 1 } = {}) {
  const { x, z } = actor.world;
  const state = actor.motion ??= { x, z, metres: 0, moving: false };
  const dx = x - state.x, dz = z - state.z;
  const distance = Math.hypot(dx, dz);
  state.x = x;
  state.z = z;
  state.moving = distance > 0.0001 && distance <= maxStep;
  if (state.moving) {
    state.metres = (state.metres + distance) % cycleMetres;
    actor.facing = Math.atan2(dx, dz);
  }
  actor.walking = state.moving;
  return state;
}

export function actorFrame(actor, frameCount, { cycleMetres = 2.5, attack = null, enemy = Boolean(actor.monster) } = {}) {
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
  const walkCount = enemy ? Math.min(count, ENEMY_WALK_FRAMES) : count;
  return Math.floor(actor.motion.metres / cycleMetres * walkCount) % walkCount;
}

// Choose the camera-relative left/right half independently of the five view files.
// Arena's opposite sides use reflected views 4, 3, 2 rather than different artwork.
export function actorMirrored(facing, x, z, eyeX, eyeZ) {
  const angle = Math.atan2(eyeX - x, eyeZ - z) - facing;
  return Math.sin(angle) < 0;
}
