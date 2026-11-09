// THE BOLT — WHAT A CASTER THROWS, AND HOW A ROLL ANSWERS IT.
//
// Arena's bestiary fights at two ranges, and the install's own roster names the casters:
// the ghost's wail, the wraith's conjured bolt, the homonculus's spit of magic, the fire
// daemon's fireball, the medusa's gaze, the lich's ward — the creatures that *do not have
// to close* are the ones UESP describes throwing magic. Everything else closes, and
// `game/combatStyle.js`'s melee telegraphs are what that fight reads.
//
// This module is the ranged half, as pure numbers: a bolt's ballistics, its hit windows
// against the player's live defence (`resolveDefence`, the same rule the melee fight
// decides by), and the kite policy that keeps a caster at the range it wants. Nothing here
// touches the DOM, the renderer or a scene's monster list.
//
// ## What is the original's and what is ours
//
// **Which creatures cast is the install's own roster** (`game/monsters.js`'s caster list,
// `RANGED_IDS`); **the ballistics are ours** — Arena's cast data is in `A.EXE` (D11) — so
// the speed, radius and damage scale are stated here and labelled GUESS, sized against the
// clocks the melee fight already runs: a bolt at `BOLT_SPEED` crosses a roll's full
// distance (`DODGE.distance` 3.2 m) in about a quarter of a second, which is what makes
// the dodge a *read* and not a spam.

import { CASTER_IDS, elementOf, isIrresistible } from './bestiary.js';
import { spellProjectileArt } from './combatFx.js';
/** A bolt travels this fast, in metres a second. */
export const BOLT_SPEED = 13;
/** Within this of the player's body, a bolt lands. */
export const BOLT_HIT_RADIUS = 0.55;
/** A bolt burns out after this — the caster's sight is shorter than its arm. */
export const BOLT_LIFE = 2.2;
/**
 * A caste's share of its own melee wound.
 *
 * A caster's damage table is its *melee* table; the bolt takes seven tenths of it, which is
 * how the tables keep their one meaning and the spell keeps its point (it came without the
 * walk across the room).
 */
export const BOLT_DAMAGE_SCALE = 0.7;
/**
 * A caster stands at this band of distance: it walks out of a shorter one, holds a longer
 * one. The low edge is 4.0 — Arena's dungeons are corridors, not arenas, and a caster
 * whose band begins past every corridor's sight is a caster that never casts inside one.
 */
export const CAST_RANGE = Object.freeze({ low: 4.0, high: 12.0 });

/**
 * The caster ids, read off UESP's own ability lines (`game/bestiary.js`).
 *
 * The old list was six — ghost, wraith, homonculus, fire daemon, medusa lich — and it was
 * missing the ones the source names in exactly the same sentence: the **snow wolf** (Ice
 * Bolt, level 6), the **hell hound** (Fireball, 6), the **stone golem** (a ranged magic
 * spell that no potion reduces), the **vampire** (spellcasting) and **Jagar Tharn** (six
 * spells). A caster that never casts was the enemy port's largest quiet gap.
 */
export const RANGED_IDS = Object.freeze([...CASTER_IDS]);

/**
 * Fire a bolt from a caster at where the player *is*.
 *
// Deliberately a snapshot of the player's present, not a lead: a dart that *leads* its
// target denies the roll its meaning, and the whole point of the tumbling fire is that
// being somewhere else when it lands is the answer.
 *
 * @param {{x: number, y: number, z: number}} from  the caster's world position (eye height)
 * @param {{x: number, y: number, z: number}} to  the player's world position
 * @param {{damage: number, id?: string}} wound  the caster's damage and its id, so the bolt
 *   knows its own element (`bestiary.js`)
 * @returns {{x: number, y: number, z: number, vx, vy, vz, damage: number, life: number}}
 */
export function fireBolt(from, to, wound) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const distance = Math.hypot(dx, dy, dz) || 1;
  const damage = Math.max(1, Math.round((Number(wound?.damage) || 4) * BOLT_DAMAGE_SCALE));
  return {
    x: from.x, y: from.y, z: from.z,
    vx: dx / distance * BOLT_SPEED,
    vy: dy / distance * BOLT_SPEED,
    vz: dz / distance * BOLT_SPEED,
    damage,
    life: BOLT_LIFE,
    // **What the bolt is made of.** A fire daemon's bolt is fire, an ice bolt is cold, and
    // the stone golem's is the one kind UESP says a potion cannot reduce. The scene reads
    // these against the player's resistances through `hurtPlayer`.
    // A caster with several spells (Jagar Tharn's six) names the one this bolt is; anything
    // else falls back to the creature's one element, which is the same answer it always gave.
    element: wound?.element ?? elementOf(wound),
    spell: wound?.spell ?? null,
    irresistible: isIrresistible(wound),
    caster: wound?.id ?? null,
    // **The bolt is drawn as the install's own projectile** (`FX_<family>B.CFA`, from the
    // executable's 27-name effect table): a fire daemon's flight is fire's loop and a snow wolf's
    // is ice's, instead of one spark coloured by hand. The scene loads the sheet and draws it; a
    // shot from a bow clears this, because an arrow is `ARROW02.CFA`.
    art: spellProjectileArt(wound?.element ?? elementOf(wound)),
    // Its own clock, for the frames: a loop at `SPELL_ART_FPS` starts at its first frame.
    age: 0,
  };
}

/**
 * A frame of the bolt's flight: move, spend life, and say whether the wall ate it.
 *
 * `solidAt(x, y, z)` reads the caller's collider — a bolt that would end the frame inside
// stone dies *at* the wall instead of passing through it, which is why dodging behind a
// pillar works exactly as hard as dodging in the open.
 *
 * @param {object} bolt  mutated in place
 * @param {number} dt
 * @param {(x: number, y: number, z: number) => boolean} solidAt
 * @returns {{dead: boolean, wallhit: boolean}}
 */
export function stepBolt(bolt, dt, solidAt) {
  const x = bolt.x + bolt.vx * dt;
  const y = bolt.y + bolt.vy * dt;
  const z = bolt.z + bolt.vz * dt;
  if (solidAt(x, y, z)) {
    bolt.life = 0;
    return { dead: true, wallhit: true };
  }
  bolt.x = x; bolt.y = y; bolt.z = z;
  bolt.life -= dt;
  return { dead: bolt.life <= 0, wallhit: false };
}

/**
 * Where the bolt is against the player's body, at this instant.
 *
 * The body is the capsule the engine already walks: a cylinder about the feet, headroom to
 * `SIGHT_EYE`'s height. The horizontal check is the circle; the vertical check is generous
 * enough that a crouch is not a dodge (dodging is the roll's answer, not squatting's).
 *
 * @param {object} bolt
 * @param {[number, number, number]} feet  the player's feet, engine order
 * @returns {boolean}
 */
export function boltAtPlayer(bolt, feet) {
  const horizontal = Math.hypot(bolt.x - feet[0], bolt.z - feet[2]);
  if (horizontal > BOLT_HIT_RADIUS) return false;
  return bolt.y >= feet[1] - 0.1 && bolt.y <= feet[1] + 1.9;
}

/**
 * Whether a bolt's **passage** touches the player, not only the point a frame left it at.
 *
 * `BOLT_SPEED` 13 m/s covers 0.65 m in a twentieth of a second — more than the 1.1 m wide
 * body it is aimed at — so testing the destination alone lets a true hit tunnel straight
 * through the player whenever a step is a little coarse (a frame hitch, a paused page's
 * `advance`). The segment is sampled at less than the hit radius, using the same body test
 * `boltAtPlayer` owns, so a fast bolt and a slow one agree about what they hit.
 *
 * @param {{x: number, y: number, z: number}} from  where the step began
 * @param {{x: number, y: number, z: number}} to  where it ended
 * @param {[number, number, number]} feet  the player's feet, engine order
 * @returns {boolean}
 */
export function boltCrossedPlayer(from, to, feet) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.ceil(length / (BOLT_HIT_RADIUS * 0.9)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (boltAtPlayer({ x: from.x + dx * t, y: from.y + dy * t, z: from.z + dz * t }, feet)) return true;
  }
  return false;
}

/**
 * What lands when a bolt and a defence meet.
 *
 * The melee fight's own rule (`resolveDefence`) decides, with the caster's honesty added:
 * a **dodge** flees the bolt outright — the i-frames are the roll, nothing else matters;
 * a **parry** is *not* a sword trick at a javelin of fire, so a live parry answers as a
 * block (the weapon takes the blow, a quarter through, the same BLOCK_THROUGH the melee
 * guard pays); a **block** holds, a quarter through; anything else lands whole.
 *
 * @param {object} bolt
 * @param {{defence?: string}} opts  what `liveDefence()` answers at this instant
 * @returns {{outcome: 'dodged'|'blocked'|'hit', damage: number}}
 */
export function resolveBolt(bolt, { defence = 'none' } = {}) {
  if (defence === 'dodge') return { outcome: 'dodged', damage: 0 };
  if (defence === 'parry' || defence === 'block') return { outcome: 'blocked', damage: Math.round(bolt.damage * 0.25) };
  return { outcome: 'hit', damage: bolt.damage };
}

/**
 * Where a caster wants to stand, and how to walk to get there.
 *
 * A caster's movement is a *band*, not a chase: inside `CAST_RANGE.low` it walks **away**
// (it does not have the reach a melee creature does, and its bolt came from exactly this
// distance), inside the band it holds and casts, past `high` it closes. The answer is the
// *direction along the bearing* (-1 away, 0 hold, +1 close) — the step itself is the
// scene's, with its walls.
 *
 * @param {number} distance  metres between the caster and the player
 * @returns {{walk: -1|0|1}}
 */
export function castFootwork(distance) {
  if (distance < CAST_RANGE.low) return { walk: -1 };
  if (distance > CAST_RANGE.high) return { walk: 1 };
  return { walk: 0 };
}

/**
 * How long a caster's cast reads. The melee `attackProfile` splits its interval by shares;
 * a caster's target-part uses the same shape with a longer wind-up (~55%, the value its
 * announce has) and a shorter recovery (a caster that stands after its throw is dead).
 *
 * @param {number} interval  the creature's own attack interval, seconds
 * @returns {{windup: number, active: number, recover: number}}
 */
export function castProfile(interval = 1.6) {
  const windup = Math.max(0.45, Math.round(Number(interval) * 0.55 * 1000) / 1000);
  return { windup, active: 0.08, recover: Math.max(0.05, Number(interval) - windup - 0.08) };
}
