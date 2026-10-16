// ARENA'S BLOOD ON THE FLOOR — a landed blow, turned into the engine's own decal placements.
//
// The owner, playing this port beside the original (2026-10-16): *"perfectarena has ugly battle
// particles that instead normal arena doesnt have but it has its own blood particles"*. The
// invented amber wind-up burst is already gone (`combatFx.js`'s `burst`, and `docs/DEFECTS.md`'s
// D-20 row); what was still missing was the half Arena actually has — **the wound leaves blood
// where it went**. The spray in the air is `combatFx.blood()`; the marks on the surface are this
// module.
//
// ## The engine already knows all of it
//
// `src/engine/combat/bloodDecals.js` is the vendored BLOOD1/BLOOD2 arc of the Daggerfall twin:
// a rate ladder from a blow's share of its target's health, a spray of marks off that ladder, a
// streak for the ones that flew, and a fixed-size ring of decal slots the host uploads. **This
// module invents no number of its own** — every count, radius and size below comes out of that
// file's exported laws, so Arena's blood and Daggerfall's blood cannot drift apart:
//
//   * `bloodRate(damage, maxHealth, density)` — the ladder (`damagePercent` → `ladderRate` →
//     `scaleRate`), i.e. how much blood this blow is worth;
//   * `sprayCount(rate)` / `sprayRadius(rate)` — how many marks reach a surface (`SPRAY_SHARE`
//     0.12, `SPRAY_MAX` 24) and how far they went;
//   * `sprayOffset(i, count, radius, rng)` — where the i-th drop lands. Drop zero is always the
//     body's own spot, which is why a hit stains where it happened whatever else it does;
//   * `dropSize(i, rate, rng)` — the pool under the body at the ladder's size, the rest at
//     `SPATTER_SCALE`, jittered by `SIZE_JITTER`;
//   * `streakFor(flown, reach)` — spatter is not round: a drop flung further is longer;
//   * `isOverkill` / `burstRate` / `burstCount` / `burstReach` — the second, bigger spawn an
//     overkill gets *beside* the ladder's spray, which is the reference's own shape;
//   * the pool's `place(point, normal, {size, tint, turn, along, stretch, uv})` — the argument
//     names a record's own fields use, so a record can be handed straight over.
//
// ## What a record is
//
//     { point, normal, size, tint, turn, along, stretch, uv }
//
// `point` and `normal` are `place`'s first two arguments (the surface the blood met and that
// surface's own normal, as a raycast answers it); the rest are its options object. `tint` is
// null, which `writeDecalQuad` turns into WHITE — **the mark wears the art's own colour**, and
// the engine's `bloodArt.js` is where blood's colour lives. `along` is the drop's own travel
// (null for the one that did not fly), which is what makes `basisAlong` lay it along its flight.
//
// ## What this module cannot do, and says so
//
// It does not raycast. The engine places a mark on a *surface* it was given, and the surface
// (a floor, a wall, a ceiling) is the scene's to find — this module takes it as an argument and
// defaults to the floor, `[0, 1, 0]`, because a blow in a dungeon lands on the floor far more
// often than anywhere else. Nor does it own the pool: the host creates one
// (`createBloodDecalPool`, `bloodDecals.js:577`), places these records into it, and draws it.

import { ArenaRandom } from './arenaRandom.js';
import {
  bloodRate, burstCount, burstRate, burstReach, dropSize, isOverkill,
  sprayCount, sprayOffset, sprayRadius, streakFor,
} from '../engine/combat/bloodDecals.js';

/**
 * How many marks one blood event may ever leave.
 *
 * **The engine's own ceiling, not a new one**: `BURST_DROPS_MAX` (`bloodDecals.js:236`) is the
 * cap on an overkill's burst — the largest single spawn the reference has — so a set inside it
 * is a set the ring can absorb in one blow.
 *
 * **A heavy overkill wants more than this, and is cut here.** The ladder's spray is 24 marks at
 * the top rung (`SPRAY_MAX`) and the burst beside it is 42 (`burstCount(false)`, 350 × 0.12), so
 * the reference's own worst case is **66**; the ring holds one event's worth and this is it. The
 * order below is what makes the truncation harmless: the spray goes in first, drop zero is the
 * body's own spot, and the burst's outermost spatter is what falls off the end — the part of a
 * spray the eye reads as noise. `tests/unit/bloodeffect.test.mjs` pins the cap.
 */
export const BLOOD_DECAL_BUDGET = 48;

/**
 * The colour a decal is tinted with — **none**, so the mark wears the art's own colour.
 *
 * `writeDecalQuad` turns a null tint into WHITE (`bloodDecals.js:516`, `const WHITE` above it),
 * which leaves the sampled texture to say what blood is. Arena's blood red as a *particle*
 * colour is `combatFx.BLOOD_COLOUR`; a decal is not a particle and tinting it here would paint
 * over the engine's own art.
 */
export const BLOOD_DECAL_TINT = null;

/** The surface a blow is assumed to have landed on when the host does not say. */
export const DEFAULT_SURFACE_NORMAL = Object.freeze([0, 1, 0]);

/**
 * Arena's blood, where a blow landed.
 *
 * @param {object} blow
 * @param {number} blow.x  world position of the wound
 * @param {number} blow.y
 * @param {number} blow.z
 * @param {number[]} [blow.normal]  the surface's own normal (default the floor)
 * @param {number} [blow.damage]    what the blow dealt (`combat.js`'s answer)
 * @param {number} [blow.maxHealth] the struck creature's own maximum
 * @param {number} [blow.power]     1 for the blow as it landed; more for a heavier one, which
 *   scales the damage the ladder reads (a critical or a charged blow passes more than 1)
 * @param {boolean} [blow.heavy]    the warhammer branch (`bloodHit`'s own field)
 * @param {boolean} [blow.bloodless] a creature that bleeds nothing (Arena's skeletons) — it
 *   marks nothing, exactly as `marksBlood(2)` says of DFU's bloodless six
 * @param {number} [blow.density]   the particle-amount setting as a fraction (0.1…1)
 * @param {number} [blow.seed]      the scene's own seed, so one blow's spray is one spray
 * @returns {Array<{point: number[], normal: number[], size: number, tint: null,
 *   turn: number, along: number[]|null, stretch: number, uv: null}>} placements, pool order
 */
export function bloodDecalsFor({
  x, y, z, normal = DEFAULT_SURFACE_NORMAL, damage = 0, maxHealth = 0,
  power = 1, heavy = false, bloodless = false, density = 1, seed = 1,
} = {}) {
  // **Nothing to stain, and nowhere to stain it.** A bloodless creature marks nothing; a blow
  // whose position is not a number is a blow in a world with no coordinates, and a mark placed
  // there would poison the ring (the pool checks this itself, `bloodDecals.js:495` — this
  // module refuses earlier and answers an empty set rather than a set of nulls).
  if (bloodless) return [];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return [];
  const surface = Array.isArray(normal) && normal.every((n) => Number.isFinite(n)) && normal.length === 3
    ? [normal[0], normal[1], normal[2]] : [...DEFAULT_SURFACE_NORMAL];

  // The blow the ladder reads. An unknown blow (no damage figures at all — a scripted hit, a
  // trap) is the ladder's **floor** rather than nothing: a hit that lands always marks
  // something, which is `scaleRate`'s own `max(1, …)`.
  const scale = Number.isFinite(power) && power > 0 ? power : 1;
  const dealt = (Number.isFinite(damage) ? Math.max(0, damage) : 0) * scale;
  const rate = bloodRate(dealt, Number.isFinite(maxHealth) ? maxHealth : 0, density);

  // One seed, one spray: the offsets, the radii and the jitter all come off this generator, so
  // the same blow answers the same marks (`arenaRandom.js` is the install's own generator).
  const random = new ArenaRandom(Number.isFinite(seed) ? seed : 1);
  const rng = () => random.next() / 65536;

  const out = [];
  const push = (point, size, along, stretch, turn) => {
    if (out.length >= BLOOD_DECAL_BUDGET) return;
    out.push({ point, normal: [...surface], size, tint: BLOOD_DECAL_TINT, turn, along, stretch, uv: null });
  };

  // ── the ladder's spray: where the wound itself bled ──────────────────────
  const count = sprayCount(rate);
  const radius = sprayRadius(rate);
  for (let i = 0; i < count; i++) {
    const [dx, dz] = sprayOffset(i, count, radius, rng);
    const flown = Math.hypot(dx, dz);
    // A drop that flew lies ALONG its travel (`basisAlong`, and `streakFor`'s own law); the one
    // that did not gets a spun basis, which is what a null `along` means.
    const along = flown > 1e-6 ? [dx, 0, dz] : null;
    push([x + dx, y, z + dz], dropSize(i, rate, rng), along, streakFor(flown, radius), rng() * Math.PI * 2);
  }

  // ── the overkill's own burst, BESIDE the spray and not instead of it ─────
  // The reference runs its burst spawn under both overkill branches *and* under neither, so the
  // ordinary spray above is never replaced; this is a second, wider ring of drops.
  if (heavy || isOverkill(dealt, Number.isFinite(maxHealth) ? maxHealth : 0)) {
    const burst = burstCount(heavy, density);
    const reach = burstReach(heavy, density);
    const burstRateValue = burstRate(heavy, density);
    for (let i = 0; i < burst; i++) {
      const [dx, dz] = sprayOffset(i, burst, reach, rng);
      const flown = Math.hypot(dx, dz);
      const along = flown > 1e-6 ? [dx, 0, dz] : null;
      push([x + dx, y, z + dz], dropSize(i, burstRateValue, rng), along, streakFor(flown, reach), rng() * Math.PI * 2);
    }
  }

  return out;
}

/**
 * What a set of records says about itself, for a HUD, a debug seam or a test.
 *
 * @param {object[]} decals a `bloodDecalsFor` answer
 * @returns {{count: number, budget: number, largest: number, spread: number, overBudget: boolean}}
 *   `spread` is how far the furthest mark landed from the wound, in metres
 */
export function bloodDecalReport(decals = []) {
  const list = Array.isArray(decals) ? decals : [];
  const origin = list.length ? list[0].point : [0, 0, 0];
  let largest = 0, spread = 0;
  for (const d of list) {
    largest = Math.max(largest, d.size);
    spread = Math.max(spread, Math.hypot(d.point[0] - origin[0], d.point[2] - origin[2]));
  }
  return { count: list.length, budget: BLOOD_DECAL_BUDGET, largest, spread, overBudget: list.length > BLOOD_DECAL_BUDGET };
}
