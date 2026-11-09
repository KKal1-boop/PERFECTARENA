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
 * **The arc's own half-angle** — sixty degrees each side of the creature's facing, so an
 * ordinary blow covers a 120° wedge *in front of it* and not the full circle the telegraph
 * used to draw. The owner, 2026-11-04: *"the circle doesnt need to be a circle anymore but a
 * arc in front of the enemy"*. A player behind the creature is outside the blow, which is the
 * whole answer the arc asks for. Jagar Tharn and the elite variants keep the circle.
 */
export const ARC_HALF_ANGLE = Math.PI / 3;

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
  // An attack written before shapes existed carries only `charge`; it is a lane when charged
  // and an arc otherwise, which is the shape the old full circle is replaced by.
  const shape = attack.profile.shape ?? (attack.profile.charge ? 'dash' : 'arc');
  return { x: attack.origin.x, y: attack.origin.y + 0.035, z: attack.origin.z,
    yaw: attack.yaw, reach: attack.profile.reach, width: shape === 'dash' ? 1.6 : 0,
    charge: shape === 'dash', shape };
}

/** Whether a point is inside the attack's committed footprint, in world space. */
export function insideAttack(attack, x, z) {
  const f = attackFootprint(attack);
  const dx = x - f.x, dz = z - f.z;
  const distance = Math.hypot(dx, dz);
  // **The full circle is the boss's and the elite's.** Jagar Tharn's blow owns the ground
  // around him; nothing ordinary does any more.
  if (f.shape === 'circle') return distance <= f.reach;
  const along = dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
  const across = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw);
  if (f.shape === 'dash') {
    return along >= -0.4 && along <= f.reach && Math.abs(across) <= f.width / 2;
  }
  // The arc: inside reach, on the front side, and within the wedge's own half-angle. A point
  // standing on the creature's feet is inside whatever it is facing.
  if (distance > f.reach) return false;
  if (along <= 0) return distance <= 0.4;
  return Math.atan2(Math.abs(across), along) <= ARC_HALF_ANGLE;
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

/** The shaft's own wood, and the head's iron. This project's colours, like the blood's. */
export const ARROW_SHAFT = Object.freeze([0.76, 0.66, 0.44]);
export const ARROW_HEAD = Object.freeze([0.28, 0.27, 0.25]);

/**
 * **The install's own spell effects, and the three jobs they do.**
 *
 * The owner, 2026-10-22, twice: *"SPELL PARTICLE SPRITES BOTH USED BY THE PLAYER AND ENEMIES ARE
 * NOT WORKING AS INTENDED"*, then *"still dont work exactly as intended"*. Both earlier passes had
 * guessed the art from two or three filenames. **The executable's own table says what the effect
 * animations are**: 27 names, in order (`ACD.EXE` through `arena/pklite.js`, the same image
 * `arena/exeData.js` reads):
 *
 * ```
 *   0…11   exp_ab.cfa … exp_md.cfa   the **explosions**, one per effect family
 *  12…23   fx_ab.cfa … fx_md.cfa     the **projectiles**, the same twelve
 *  24…26   bloodexp.cfa, sparkle.cfa, dust.cfa   Arena's three *physical* hit bursts
 * ```
 *
 * and a second list, sitting beside the game's own casting line (*"Silence spell prevents spell
 * casting."*), names the **screen** sheets in the order of the spell file's element byte
 * (`spellsFile.js`'s `ELEMENTS`): `fire.cfa`, `ice.cfa`, `acid.cfa`, `shock.cfa`, `magic.cfa`.
 *
 * So an element has three pictures, not one: the big sheet across the view when the spell is
 * cast, the little loop that flies (`FX_`), and the one-shot burst where it lands (`EXP_`).
 * Rendering every frame of all of them in `PAL.COL` (`.scratch` probe) is what tells the six
 * families apart: **A** acid (green), **E** electric (blue-white stars), **F** fire (a gold
 * ball), **G** gas (a grey cloud), **I** ice (blue shards), **M** magic (white sparks).
 *
 * **The `_B` take and the `_D` take.** Every family ships twice, in the same colour and the same
 * kind of event, and nothing this port can read says when the original chose one over the other.
 * The `_B` take — the full-size one in every family — is the art here; the `_D` names are left out
 * rather than given an invented rule.
 *
 * `SPPARTS.RCI` (9 × 9, five indices, no cutout) is none of this: it is a texture animation field,
 * and drawing it as a burst is what made the first report's brown block.
 */

/** Which family of effect an element wears. `A` acid, `E` electric, `F` fire, `G` gas, `I` ice, `M` magic. */
export const SPELL_FAMILY = Object.freeze({
  fire: 'F', cold: 'I', frost: 'I', ice: 'I',
  poison: 'A', acid: 'A', shock: 'E', electric: 'E',
  magic: 'M', heal: 'M', disease: 'G', gas: 'G',
  // A blow, not a spell: an arrow or a blade has no effect sheet of its own, and `null` is how
  // the table says so (the physical hit bursts live at the end of the executable's 27 names and
  // are `BLOODEXP.CFA`/`SPARKLE.CFA`/`DUST.CFA`, which `blood()` already uses).
  physical: null, weapon: null,
});

/**
 * The element's family letter — `M` for anything the table does not name, `null` for a blow.
 *
 * Magic is the fallback on purpose: it is the one family whose art reads as *a spell* rather than
 * as an element, so an unlabelled cast is drawn as magic instead of as nothing. A named physical
 * wound is not a spell at all and answers `null`, which is what keeps a spell's projectile art
 * off an arrow.
 *
 * @param {string} element
 * @returns {'A'|'E'|'F'|'G'|'I'|'M'|null}
 */
export function spellFamily(element) {
  const key = String(element ?? '').toLowerCase();
  return key in SPELL_FAMILY ? SPELL_FAMILY[key] : 'M';
}

/** The projectile sheets, by family — the second half of the executable's table. */
export const SPELL_PROJECTILE_ART = Object.freeze({
  A: 'FX_AB.CFA', E: 'FX_EB.CFA', F: 'FX_FB.CFA', G: 'FX_GB.CFA', I: 'FX_IB.CFA', M: 'FX_MB.CFA',
});

/** The explosion sheets, by family — the first half of the executable's table. */
export const SPELL_EXPLOSION_ART = Object.freeze({
  A: 'EXP_AB.CFA', E: 'EXP_EB.CFA', F: 'EXP_FB.CFA', G: 'EXP_GB.CFA', I: 'EXP_IB.CFA', M: 'EXP_MB.CFA',
});

/** The screen sheets, by family — the element-ordered list beside the casting text. */
export const SPELL_SPLASH_ART = Object.freeze({
  F: 'FIRE.CFA', I: 'ICE.CFA', A: 'ACID.CFA', E: 'SHOCK.CFA', M: 'MAGIC.CFA', G: 'SMOKE.CFA',
});

/** Every sheet a cast can draw, for the loader. */
export const SPELL_ART = Object.freeze([...new Set([
  ...Object.values(SPELL_PROJECTILE_ART),
  ...Object.values(SPELL_EXPLOSION_ART),
  ...Object.values(SPELL_SPLASH_ART),
])]);

/**
 * The rate the install's effect sheets are drawn at: **twelve frames a second**, which is
 * `ArenaAnimUtils::VfxIdleSecondsPerFrame` (`1.0 / 12.0`) applied to both kinds.
 */
export const SPELL_ART_FPS = 12;

/**
 * How fast a cast's visible flight crosses the room, in metres a second.
 *
 * The same speed the fight's bolts fly (`game/ranged.js`'s `BOLT_SPEED`), so the picture and the
 * mechanic cannot disagree about how long a spell takes to arrive.
 */
export const SPELL_FLIGHT_SPEED = 13;

/** A flight is at least this long (a spell cast at something in arm's reach still reads) … */
export const SPELL_FLIGHT_MIN = 0.08;
/** … and at most this long (a bolt down a long corridor still lands while the cast is fresh). */
export const SPELL_FLIGHT_MAX = 0.4;

/**
 * The loop a cast **flies** with: `FX_<family>B.CFA`.
 *
 * @param {string} element  the spell's element (`game/spells.js`, the bestiary's own word)
 * @returns {string|null}
 */
export function spellProjectileArt(element) {
  const family = spellFamily(element);
  return family ? SPELL_PROJECTILE_ART[family] ?? null : null;
}

/**
 * The burst a cast **makes where it lands**: `EXP_<family>B.CFA`, played once.
 *
 * @param {string} element
 * @returns {string|null}
 */
export function spellExplosionArt(element) {
  const family = spellFamily(element);
  return family ? SPELL_EXPLOSION_ART[family] ?? null : null;
}

/**
 * The sheet that crosses the **screen** when this element is cast — the original's own big
 * effect, 160 × 147 at its largest, half of the 320 × 200 view.
 *
 * @param {string} element
 * @returns {string|null}
 */
export function spellSplashArt(element) {
  const family = spellFamily(element);
  return family ? SPELL_SPLASH_ART[family] ?? null : null;
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
    /** How many casts have thrown motes (`magicBurst`), for the seam and the tests. */
    this.magicBursts = 0;
    /**
     * **Arena's blood explosion** (`BLOODEXP.CFA`), one per landed blow.
     *
     * The old spray was a ring of coloured quads this project invented; the install ships the
     * original's own five-frame blood burst, and the scene draws it as a billboard where the
     * wound is (`liveBatches`). This list is the animation's clock — the sprite's frame comes
     * from `age / life` — so the record lives here with the rest of the effects.
     *
     * @type {{x: number, y: number, z: number, age: number, life: number}[]}
     */
    this.sprays = [];
    /**
     * **The spells in flight** — `FX_<family>B.CFA`, the install's own projectile loop, moving
     * from where a cast left to what it was aimed at.
     *
     * Arena's model is two entities, not one: a **projectile** spawned at the caster's eye that
     * flies and loops its frames, and an **explosion** spawned where it stopped (`exp_…` / `fx_…`
     * in the executable's own table). These records are that flight; when their clock runs out the
     * burst is spawned at the target and the record goes. `age` drives the frame
     * (`age × SPELL_ART_FPS`, twelve frames a second), and `x/y/z` is the position this tick.
     *
     * @type {{sheet: string, sx: number, sy: number, sz: number, x: number, y: number, z: number,
     *   tx: number, ty: number, tz: number, age: number, life: number, explosion: string}[]}
     */
    this.flights = [];
    /**
     * **The bursts where a spell lands** — `EXP_<family>B.CFA`, played once, standing where the
     * wound is.
     *
     * The scene draws a frame from `age` and places the billboard so its **centre** is the point;
     * Arena's own explosion is spawned half its height below the wound
     * (`CombatLogic::getSpellExplosionEntityInitInfo`), which is the same statement.
     *
     * @type {{x: number, y: number, z: number, age: number, life: number, sheet: string}[]}
     */
    this.explosions = [];
    /**
     * **The sheet a cast puts across the view** — `FIRE.CFA`, `ICE.CFA`, `ACID.CFA`, `SHOCK.CFA`,
     * `MAGIC.CFA` (and `SMOKE.CFA` for gas), the original's own screen-sized effects.
     *
     * One at a time — a second cast replaces the first, the same way a swing replaces a swing —
     * and the scene paints it on the weapon's own 2D layer (`drawSpellView`).
     *
     * @type {{sheet: string, age: number, life: number}[]}
     */
    this.splashes = [];
    /**
     * How many frames each sheet has, once the scene has loaded the art, so a burst's clock is
     * its own sheet's length (`frames / SPELL_ART_FPS`) rather than a guess.
     *
     * @type {Map<string, number>|null}
     */
    this.artFrames = null;
    /** How many casts have put a sheet across the view, for the seam and the tests. */
    this.splashesShown = 0;
    /** The bolts in flight, set each frame by the scene (`game/ranged.js` owns their life). */
    this.bolts = [];
    /** The player's arrows in flight, set each frame by the scene (`game/archery.js`). */
    this.arrows = [];
  }
  setBolts(bolts = []) { this.bolts = bolts; }
  setArrows(arrows = []) { this.arrows = arrows; }
  /**
   * Tell the pool how long each effect sheet runs, after the scene has parsed it.
   * @param {Map<string, number>} frames  sheet name → frame count
   */
  setArtFrames(frames) { this.artFrames = frames ?? null; }
  /**
   * How long one sheet stays up: its own frame count at `SPELL_ART_FPS`, or `fallback` while the
   * art is not loaded yet (a cast that lands in the first frame of a level is not an error).
   *
   * @param {string} sheet @param {number} [fallback]
   * @returns {number} seconds
   */
  artSeconds(sheet, fallback = 1) {
    const frames = this.artFrames?.get(sheet);
    return Number.isFinite(frames) && frames > 0 ? frames / SPELL_ART_FPS : fallback;
  }
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
        art: 'blood',
      });
      emitted++;
    }
    // **One burst of the install's own art, at the wound.** `BLOODEXP.CFA` is Arena's five-frame
    // blood explosion; the drops above are its clock and its seam, and the scene draws the
    // sprite. A spray that is already up is replaced rather than stacked, so a flurry of blows
    // on one creature does not paint five explosions in the same square metre.
    this.sprays = this.sprays.filter((spray) => Math.hypot(spray.x - x, spray.z - z) > 0.7);
    if (this.sprays.length >= 8) this.sprays.shift();
    this.sprays.push({ x, y, z, age: 0, life: 0.5 });
    this.bloodSprays++;
    return emitted;
  }
  /**
   * **A cast's world effect** — the install's own projectile and its own burst.
   *
   * This is Arena's two-entity model (`CombatLogic::getSpellProjectileEntityInitInfo` /
   * `getSpellExplosionEntityInitInfo`): the spell **leaves** somewhere as `FX_<family>B.CFA` and
   * **lands** somewhere as `EXP_<family>B.CFA`. Given a `from`, the flight is the picture and the
   * burst follows it (the scene's own cast is resolved instantly, so this is how the player sees
   * it cross the room); without one — a bolt that has already flown, a self-cast at the hands —
   * the burst is the whole effect, at `x/y/z`.
   *
   * @param {number} x @param {number} y @param {number} z  where the spell lands, world space
   * @param {{element?: string, from?: number[]|null}} [opts]
   *   `from` is the `[x, y, z]` the cast left (the caster's hands); omit it for a bolt that has
   *   already flown
   * @returns {number} how many effects were started (0 when the point is not a point)
   */
  magicBurst(x, y, z, { element = 'magic', from = null } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 0;
    const explosion = spellExplosionArt(element);
    if (!explosion) return 0;
    const start = Array.isArray(from) && from.length === 3 && from.every(Number.isFinite) ? from : null;
    const distance = start ? Math.hypot(x - start[0], y - start[1], z - start[2]) : 0;
    if (start && distance > 0.35) {
      this.flights.push({
        sheet: spellProjectileArt(element),
        sx: start[0], sy: start[1], sz: start[2], x: start[0], y: start[1], z: start[2],
        tx: x, ty: y, tz: z, age: 0, explosion,
        life: Math.max(SPELL_FLIGHT_MIN, Math.min(SPELL_FLIGHT_MAX, distance / SPELL_FLIGHT_SPEED)),
      });
      if (this.flights.length > 8) this.flights.shift();
    } else {
      this.spawnExplosion(x, y, z, explosion);
    }
    this.magicBursts++;
    return 1;
  }
  /**
   * One burst where a spell stopped, and the square metre it owns.
   *
   * A burst already up in the same place is replaced rather than stacked — a flurry of castings
   * on one creature must not paint four explosions over it — and the list has a hard ceiling so a
   * room full of casters cannot grow it without bound.
   *
   * @param {number} x @param {number} y @param {number} z
   * @param {string} sheet
   */
  spawnExplosion(x, y, z, sheet) {
    this.explosions = this.explosions.filter((burst) =>
      burst.sheet !== sheet || Math.hypot(burst.x - x, burst.z - z) > 0.8);
    if (this.explosions.length >= 8) this.explosions.shift();
    this.explosions.push({ x, y, z, age: 0, life: this.artSeconds(sheet), sheet });
  }
  /**
   * **The screen sheet a cast puts across the view** — the original's own big effect.
   *
   * The player is the caster here: the element's sheet (`spellSplashArt`) plays once, replacing
   * whatever was up. A creature's cast does not paint one — the player is not casting, and the
   * bolt's own `FX_`/`EXP_` art is what they see coming.
   *
   * @param {string} element
   * @returns {boolean} whether a sheet was put up
   */
  spellSplash(element) {
    const sheet = spellSplashArt(element);
    if (!sheet) return false;
    this.splashes = [{ sheet, age: 0, life: this.artSeconds(sheet) }];
    this.splashesShown++;
    return true;
  }
  step(dt) {
    for (const p of this.particles) {
      p.age += dt; p.vy -= 6 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const spray of this.sprays) spray.age += dt;
    this.sprays = this.sprays.filter((spray) => spray.age < spray.life);
    // The flights first: one that arrives this tick leaves its burst behind in the same tick, so
    // there is never a frame with neither the projectile nor its explosion on screen.
    const arrived = [];
    for (const flight of this.flights) {
      flight.age += dt;
      const t = flight.life > 0 ? Math.min(1, flight.age / flight.life) : 1;
      flight.x = flight.sx + (flight.tx - flight.sx) * t;
      flight.y = flight.sy + (flight.ty - flight.sy) * t;
      flight.z = flight.sz + (flight.tz - flight.sz) * t;
      if (flight.age >= flight.life) arrived.push(flight);
    }
    if (arrived.length) {
      for (const flight of arrived) this.spawnExplosion(flight.tx, flight.ty, flight.tz, flight.explosion);
      this.flights = this.flights.filter((flight) => !arrived.includes(flight));
    }
    for (const burst of this.explosions) burst.age += dt;
    this.explosions = this.explosions.filter((burst) => burst.age < burst.life);
    for (const splash of this.splashes) splash.age += dt;
    this.splashes = this.splashes.filter((splash) => splash.age < splash.life);
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
      // **A spell cast wears the attack animation but is not a melee blow.** There is no ring to
      // plant: the caster's answer is the bolt, and the owner's earlier rule stands ("a caster
      // throws and throws only"). The animation is still drawn by the actor pass, which reads
      // `actor.attack` and therefore plays frames 8–11 exactly as a swing does.
      if (!a || a.spell || (actor.monster?.health ?? actor.fighter?.health ?? 0) <= 0) continue;
      const active = a.elapsed >= a.profile.windup && a.elapsed < a.profile.windup + a.profile.active;
      if (a.elapsed >= a.profile.windup + a.profile.active) continue;
      const f = attackFootprint(a), progress = Math.min(1, a.elapsed / a.profile.windup);
      const point = (x, z) => [x, a.ground
        ? a.ground.y + 0.035 + (x - f.x) * a.ground.dx + (z - f.z) * a.ground.dz : f.y, z];
      const colour = active ? [1, 0.16, 0.07] : f.charge ? [1, 0.78, 0.16] : [1, 0.43, 0.12];
      if (f.shape === 'dash') {
        // **A lane, because a dash commits to a line.** The creature cannot turn it once it
        // has been announced, and the lane is the whole of where it will be dangerous.
        const rx = Math.cos(f.yaw) * f.width / 2, rz = -Math.sin(f.yaw) * f.width / 2;
        const fx = Math.sin(f.yaw) * f.reach, fz = Math.cos(f.yaw) * f.reach;
        const corners = [point(f.x - rx, f.z - rz), point(f.x + rx, f.z + rz),
          point(f.x + fx + rx, f.z + fz + rz), point(f.x + fx - rx, f.z + fz - rz)];
        this.quad(...corners, colour, active ? 0.7 : 0.2 + progress * 0.3);
      } else if (f.shape === 'arc') {
        // **The arc in front of the creature**, sixty degrees each side of its facing. The rim
        // is drawn as a band and the wedge fills as the wind-up runs, exactly as the old ring
        // did — the only change is the shape the player has to step out of.
        const segments = 22;
        const from = -ARC_HALF_ANGLE, to = ARC_HALF_ANGLE;
        const pt = (angle, radius) => point(
          f.x + Math.sin(f.yaw + angle) * radius, f.z + Math.cos(f.yaw + angle) * radius);
        for (let i = 0; i < segments; i++) {
          const p = from + (to - from) * i / segments;
          const q = from + (to - from) * (i + 1) / segments;
          this.quad(pt(p, f.reach - 0.09), pt(p, f.reach), pt(q, f.reach), pt(q, f.reach - 0.09), colour, 0.88);
          if (active || (i + 1) / segments <= progress) {
            for (const vertex of [point(f.x, f.z), pt(p, f.reach - 0.09), pt(q, f.reach - 0.09)])
              this.vertex(...vertex, colour, active ? 0.32 : 0.11);
          }
        }
        // The two edges, so the wedge reads as a shape a player can step out of sideways.
        for (const angle of [from, to]) {
          this.quad(pt(angle, 0.1), pt(angle, f.reach - 0.09),
            pt(angle + 0.02, f.reach - 0.09), pt(angle + 0.02, 0.1), colour, 0.55);
        }
      } else {
        // **The circle is the last boss's and the elite's**, and it is still the whole ground
        // around the creature: those are the blows whose answer is to leave the area.
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
    // **A spell bolt is its element's own sprite now** (`FX_<family>B.CFA`, drawn by the scene
    // from `bolt.art`), not a crossed pair of coloured quads: the install ships twelve projectile
    // animations and the port invented its own spark for none of them. Nothing is emitted here;
    // `game/ranged.js` names the sheet and `liveBatches` draws it.
    // ── the player's arrows ────────────────────────────────────────────────
    // **A shaft, not a spark.** A caster's bolt is a glow (`ranged.js`), and a bow's missile is a
    // piece of wood: one thin ribbon along the arrow's own travel, with the head end brighter.
    // It is the same two-triangle quad the effects pool already draws, so an arrow costs no
    // texture and no draw call of its own; the install's `ARROWS.CIF` is the 12×9 projectile art
    // the original draws from the first person, and at the range a bow is used a 12-pixel sprite
    // in the world is a speck — this is the world's own arrow, and it is this project's reading.
    for (const arrow of this.arrows) {
      const travel = Math.hypot(arrow.vx, arrow.vz) || 1;
      const ux = arrow.vx / travel, uz = arrow.vz / travel;
      const length = 0.55;
      const half = 0.022;
      const tailX = arrow.x - ux * length, tailZ = arrow.z - uz * length;
      const rx = cameraRight[0] * half, rz = cameraRight[2] * half;
      this.quad(
        [tailX - rx, arrow.y, tailZ - rz], [tailX + rx, arrow.y, tailZ + rz],
        [arrow.x + rx, arrow.y, arrow.z + rz], [arrow.x - rx, arrow.y, arrow.z - rz],
        ARROW_SHAFT, 0.95,
      );
      // The head, a darker point so the direction of flight reads at a glance.
      const backX = arrow.x - ux * 0.09, backZ = arrow.z - uz * 0.09;
      this.quad(
        [backX - rx * 1.6, arrow.y, backZ - rz * 1.6],
        [backX + rx * 1.6, arrow.y, backZ + rz * 1.6],
        [arrow.x + rx * 0.2, arrow.y, arrow.z + rz * 0.2],
        [arrow.x - rx * 0.2, arrow.y, arrow.z - rz * 0.2],
        ARROW_HEAD, 1,
      );
    }
    // **The wound is Arena's own sprite, not this pass's quads.** `BLOODEXP.CFA` is the install's
    // five-frame blood burst and the scene draws it through the billboard pass that draws every
    // other piece of Arena art, because this pass is a flat colour program with no texture unit.
    // A defence's tell (a parry's flash, a block's dust, a charge's ring) has no Arena art of its
    // own and keeps the quad it always had, so `art` is the one switch between the two drawings.
    for (const p of this.particles) {
      if (p.art) continue;
      const r = p.size, rx = cameraRight[0] * r, rz = cameraRight[2] * r;
      this.quad([p.x - rx, p.y - r, p.z - rz], [p.x + rx, p.y - r, p.z + rz],
        [p.x + rx, p.y + r, p.z + rz], [p.x - rx, p.y + r, p.z - rz], p.colour, 1 - p.age / p.life);
    }
    return this.vertices.subarray(0, this.count * 7);
  }
}
