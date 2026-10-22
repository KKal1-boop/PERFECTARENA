// BODIES ARE NOT POINTS — what the player may not walk through.
//
// The owner, 2026-10-21: *\"enemies have no collision with the player and so you can pass
// trough them and they never block your way making it basically optional to fight\"*. The
// scene has always pushed the player out of a **person** (`interior.js`'s
// `pushPlayerFromPeople`, D-47) and out of another **creature** (`separateBodies`), but a
// living enemy was not a body the player's own step respected: the motor walked straight
// through the chest of a wolf standing in a doorway, so the fight was a choice.
//
// This module is the one law for all three, kept pure so it can be tested without a
// browser: a body is a circle on the floor, and a point that has crossed into one is put
// back on its rim — **only if the rim is somewhere a body can stand**. Pushing a player
// into a wall to keep them out of a monster would be the same defect with a different
// culprit, so `walkable` is asked before the correction is accepted.
//
// The correction is never more than the overlap, and a point exactly at a body's centre is
// pushed along +x (the same tie-break `separateBodies` uses), because there is no
// direction to prefer.

/**
 * Push a point out of a list of circular bodies.
 *
 * @param {{x: number, z: number}} point
 * @param {{x: number, z: number}[]} bodies
 * @param {number} minDistance  the two radii added together
 * @param {(x: number, z: number) => boolean} [walkable]  where the correction may land
 * @returns {{x: number, z: number, pushed: boolean}}
 */
export function pushOutOfBodies(point, bodies, minDistance, walkable = () => true) {
  let x = Number(point?.x) || 0;
  let z = Number(point?.z) || 0;
  const gap = Number(minDistance) > 0 ? Number(minDistance) : 0;
  let pushed = false;
  for (const body of bodies ?? []) {
    if (!body) continue;
    const bx = Number(body.x) || 0;
    const bz = Number(body.z) || 0;
    let dx = x - bx;
    let dz = z - bz;
    let distance = Math.hypot(dx, dz);
    if (distance >= gap) continue;
    if (distance < 1e-4) { dx = 1; dz = 0; distance = 0; }
    const nx = bx + (dx / (distance || 1)) * gap;
    const nz = bz + (dz / (distance || 1)) * gap;
    if (walkable(nx, nz)) { x = nx; z = nz; pushed = true; }
  }
  return { x, z, pushed };
}

/**
 * Is a point close enough to a body that a walking body should stop?
 *
 * A creature's step asks this about the player: it may close to the reach of its own arm,
 * and no further into the player's chest.
 *
 * @param {{x: number, z: number}} a @param {{x: number, z: number}} b
 * @param {number} minDistance
 * @returns {boolean}
 */
export function withinBody(a, b, minDistance) {
  if (!a || !b) return false;
  return Math.hypot((Number(a.x) || 0) - (Number(b.x) || 0), (Number(a.z) || 0) - (Number(b.z) || 0)) < minDistance;
}
