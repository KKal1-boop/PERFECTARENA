// Arena-native combat presentation, following the reference engines' bounded particle pools.
// Geometry is WORLD space. Camera changes never alter a strike's footprint.
//
// **Two channels, and only one of them is blood.** `burst()` is the tell of an *exchange* — a
// parry's sparks, a block, a charge's dust — and its `'hit'` arm is the wound; `blood()` is a
// landed blow's own spray, which is the whole of Arena's hit feedback and the thing the owner
// found missing beside the original ("perfectarena has ugly battle particles … instead normal
// arena … has its own blood particles", 2026-10-16 — D-20). The marks blood leaves on the
// surface are `game/bloodEffect.js`'s; this file owns only the spray in the air.
export const FX_MAX_PARTICLES = 192;
export const FX_MAX_VERTICES = 16384;

/**
 * Arena's blood red — **one number for the whole program.**
 *
 * It arrived here as the `'hit'` arm's literal `[0.55, 0.06, 0.05]` (the value the D-20 row
 * established when the amber spray was deleted), and `blood()` below emits the same red rather
 * than a second, slightly different one: two reds in one fight is how a colour starts drifting.
 * The *decal* is not tinted with it — a mark wears the engine's own blood art
 * (`bloodEffect.js`'s `BLOOD_DECAL_TINT`).
 */
export const BLOOD_COLOUR = Object.freeze([0.55, 0.06, 0.05]);

/**
 * The spray's bounds, as a landed blow's own law.
 *
 * A blow at `power` 1 gives `min` particles, and each further point of power adds `perPower`
 * *up to* `max` — so a graze and a charged heavy cannot be told apart by counting forever, and
 * the pool's own `FX_MAX_PARTICLES` ceiling stays the outer bound. Project numbers, stated as
 * such: Arena's particle counts live in `A.EXE`, which this checkout does not ship
 * (`docs/PORT_BLOCKS.md` §1 rule 2).
 */
export const BLOOD_PARTICLES = Object.freeze({ min: 6, max: 12, perPower: 6 });

export function attackFootprint(attack) {
  return { x: attack.origin.x, y: attack.origin.y + 0.035, z: attack.origin.z,
    yaw: attack.yaw, reach: attack.profile.reach, width: attack.profile.charge ? 1.6 : 0,
    charge: Boolean(attack.profile.charge) };
}

export function insideAttack(attack, x, z) {
  const f = attackFootprint(attack);
  const dx = x - f.x, dz = z - f.z;
  if (!f.charge) return Math.hypot(dx, dz) <= f.reach;
  const along = dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
  const across = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw);
  return along >= -0.4 && along <= f.reach && Math.abs(across) <= f.width / 2;
}

// Adapted from Daggerfall Enhanced ai/foeBlows.js::fitBlowToGround. Sample once at
// commitment, not from the camera each paint; a raised floor must not swallow the mark.
export function fitAttackToGround(attack, collider) {
  if (!collider?.raycast) return attack;
  const { x, y, z } = attack.origin;
  const height = (px, pz) => {
    const distance = collider.raycast([px, y + 1.5, pz], [0, -1, 0], 3);
    return Number.isFinite(distance) ? y + 1.5 - distance : null;
  };
  const base = height(x, z);
  if (base === null) return attack;
  const hx = height(x + 2, z), hz = height(x, z + 2);
  const slope = (h) => h === null ? 0 : Math.max(-1, Math.min(1, (h - base) / 2));
  attack.ground = { y: base, dx: slope(hx), dz: slope(hz) };
  return attack;
}

export class CombatFx {
  constructor() {
    this.particles = [];
    this.vertices = new Float32Array(FX_MAX_VERTICES * 7);
    this.count = 0;
    this.telegraphs = 0;
    this.bursts = 0;
    /** How many landed blows have sprayed blood (`blood()`), for the seam and the tests. */
    this.bloodSprays = 0;
    /** The bolts in flight, set each frame by the scene (`game/ranged.js` owns their life). */
    this.bolts = [];
  }
  setBolts(bolts = []) { this.bolts = bolts; }
  burst(x, y, z, outcome = 'hit', heavy = false) {
    // **A landed blow is blood, not sparks.** Arena's own hit feedback is the wound, and the
    // owner's report names this port's coloured debris among the things that read as foreign
    // ("ugly battle particles … instead normal arena … has its own blood particles",
    // 2026-10-16 — D-20). The parry, the block and a charge's dust keep their own colours:
    // those are the tell of a *defence*, and reading them is how a player learns the exchange.
    const colour = outcome === 'parried' ? [1, 0.85, 0.3]
      : outcome === 'charge' ? [1, 0.78, 0.16]  // a charge stamps dust; the hold itself has no tell now
      : outcome === 'blocked' ? [0.6, 0.85, 1]
      : outcome === 'dust' ? [0.65, 0.53, 0.35] : BLOOD_COLOUR;
    const count = heavy ? 14 : outcome === 'charge' ? 5 : 8;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= FX_MAX_PARTICLES) this.particles.shift();
      const a = i / count * Math.PI * 2 + this.bursts * 0.73;
      const speed = (heavy ? 3 : 1.7) * (0.7 + (i % 3) * 0.2);
      this.particles.push({ x, y, z, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed,
        vy: 0.9 + (i % 4) * 0.35, life: 0.48, age: 0, colour, size: heavy ? 0.07 : 0.045 });
    }
    this.bursts++;
  }
  /**
   * A landed blow's blood, out of the wound.
   *
   * **Bounded, directional, and the same red every time.** The spray is `dir`'s own fan when the
   * scene knows which way the blow drove the blood (an attacker's facing, a bolt's travel) and
   * an even ring when it does not, so a blow from behind does not spray into the player's eyes.
   * `power` is the blow's own: 1 for the hit as it landed, more for a charged or critical one —
   * see `BLOOD_PARTICLES` for the band, and `FX_MAX_PARTICLES` for the ceiling the pool holds
   * whatever this is asked for.
   *
   * @param {number} x @param {number} y @param {number} z  the wound, in world space
   * @param {{power?: number, dir?: number[]|null}} [opts]  `dir` is `[dx, dz]`
   * @returns {number} how many particles were emitted
   */
  blood(x, y, z, { power = 1, dir = null } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 0;
    const p = Number.isFinite(power) && power > 0 ? power : 1;
    const wanted = BLOOD_PARTICLES.min + BLOOD_PARTICLES.perPower * (p - 1);
    const count = Math.max(BLOOD_PARTICLES.min, Math.min(BLOOD_PARTICLES.max, Math.round(wanted)));
    // The fan's own centre: the direction the blood was driven, or null for an even ring.
    const aimed = Array.isArray(dir) && Number.isFinite(dir[0]) && Number.isFinite(dir[1]) && Math.hypot(dir[0], dir[1]) > 1e-6
      ? Math.atan2(dir[0], dir[1]) : null;
    const fan = 0.7;   // radians each side of `dir`, so a spray is a cone and not a line
    let emitted = 0;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= FX_MAX_PARTICLES) this.particles.shift();
      const spread = 0.7 + (i % 3) * 0.25;
      const angle = aimed === null
        ? i / count * Math.PI * 2 + this.bursts * 0.73
        : aimed + (count > 1 ? (i / (count - 1) * 2 - 1) : 0) * fan;
      const speed = 1.7 * spread * (1 + (p - 1) * 0.15);
      this.particles.push({
        x, y, z, vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed,
        vy: 0.9 + (i % 4) * 0.35, life: 0.48, age: 0, colour: BLOOD_COLOUR, size: 0.045,
      });
      emitted++;
    }
    this.bloodSprays++;
    return emitted;
  }
  step(dt) {
    for (const p of this.particles) {
      p.age += dt; p.vy -= 6 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }
  vertex(x, y, z, colour, alpha) {
    if (this.count >= FX_MAX_VERTICES) return;
    this.vertices.set([x, y, z, ...colour, alpha], this.count++ * 7);
  }
  quad(a, b, c, d, colour, alpha) {
    for (const p of [a, b, c, a, c, d]) this.vertex(...p, colour, alpha);
  }
  geometry(actors, cameraRight) {
    this.count = 0; this.telegraphs = 0;
    for (const actor of actors) {
      const a = actor.attack;
      if (!a || (actor.monster?.health ?? actor.fighter?.health ?? 0) <= 0) continue;
      const active = a.elapsed >= a.profile.windup && a.elapsed < a.profile.windup + a.profile.active;
      if (a.elapsed >= a.profile.windup + a.profile.active) continue;
      const f = attackFootprint(a), progress = Math.min(1, a.elapsed / a.profile.windup);
      const point = (x, z) => [x, a.ground
        ? a.ground.y + 0.035 + (x - f.x) * a.ground.dx + (z - f.z) * a.ground.dz : f.y, z];
      const colour = active ? [1, 0.16, 0.07] : f.charge ? [1, 0.78, 0.16] : [1, 0.43, 0.12];
      if (f.charge) {
        const rx = Math.cos(f.yaw) * f.width / 2, rz = -Math.sin(f.yaw) * f.width / 2;
        const fx = Math.sin(f.yaw) * f.reach, fz = Math.cos(f.yaw) * f.reach;
        const corners = [point(f.x - rx, f.z - rz), point(f.x + rx, f.z + rz),
          point(f.x + fx + rx, f.z + fz + rz), point(f.x + fx - rx, f.z + fz - rz)];
        this.quad(...corners, colour, active ? 0.7 : 0.2 + progress * 0.3);
      } else {
        const segments = 48;
        for (let i = 0; i < segments; i++) {
          const p = i / segments * Math.PI * 2, q = (i + 1) / segments * Math.PI * 2;
          const pt = (angle, radius) => point(f.x + Math.sin(angle) * radius, f.z + Math.cos(angle) * radius);
          this.quad(pt(p, f.reach - 0.09), pt(p, f.reach), pt(q, f.reach), pt(q, f.reach - 0.09), colour, 0.88);
          if (active || i / segments <= progress) {
            for (const vertex of [point(f.x, f.z), pt(p, f.reach - 0.09), pt(q, f.reach - 0.09)])
              this.vertex(...vertex, colour, active ? 0.32 : 0.11);
          }
        }
      }
      this.telegraphs++;
    }
    // ── the bolts in flight ────────────────────────────────────────────────
    // Two crossed billboard quads at the bolt's own position — a spark the eye reads at any
    // angle — drawn before the particles so a burst of impact lands on top of the last
    // frame of its flight.
    for (const bolt of this.bolts) {
      const r = 0.09;
      const colour = bolt.fire ? [1, 0.45, 0.12] : [0.55, 0.75, 1];
      this.quad(
        [bolt.x - cameraRight[0] * r, bolt.y - r, bolt.z - cameraRight[2] * r],
        [bolt.x + cameraRight[0] * r, bolt.y - r, bolt.z + cameraRight[2] * r],
        [bolt.x + cameraRight[0] * r, bolt.y + r, bolt.z + cameraRight[2] * r],
        [bolt.x - cameraRight[0] * r, bolt.y + r, bolt.z - cameraRight[2] * r],
        colour, 0.95);
      const up = 0.09;
      this.quad(
        [bolt.x, bolt.y - up, bolt.z],
        [bolt.x + cameraRight[0] * r, bolt.y, bolt.z + cameraRight[2] * r],
        [bolt.x, bolt.y + up, bolt.z],
        [bolt.x - cameraRight[0] * r, bolt.y, bolt.z - cameraRight[2] * r],
        colour, 0.95);
    }
    for (const p of this.particles) {
      const r = p.size, rx = cameraRight[0] * r, rz = cameraRight[2] * r;
      this.quad([p.x - rx, p.y - r, p.z - rz], [p.x + rx, p.y - r, p.z + rz],
        [p.x + rx, p.y + r, p.z + rz], [p.x - rx, p.y + r, p.z - rz], p.colour, 1 - p.age / p.life);
    }
    return this.vertices.subarray(0, this.count * 7);
  }
}
