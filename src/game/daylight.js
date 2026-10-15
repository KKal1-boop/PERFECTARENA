// THE SUN OVER TAMRIEL — the twin's own day/night law, so a town in this port has an evening.
//
// Until this module existed the scene set its light **once**, when a level was built: a fixed
// ambient, a fixed sun, and the sun's direction hard-wired straight up
// (`renderer.beginFrame(proj, view, [0, 1, 0], ...)`, `scenes/interior.js`). A town therefore
// had a clock — `game/livingWorld.js` shuts the smith's door at six and sends its people to the
// tavern — and no light that agreed with it: the same noon poured over a street at midnight,
// and the sky was one painted panorama for all twenty-four hours. The wall clock and the sun
// could not both be right.
//
// This is the twin's answer, carried rather than invented. `daggerfall/src/world/worldClock.js`
// is itself 1:1 with **Daggerfall Unity** (`DaggerfallDateTime`, `SunlightManager`,
// `PlayerAmbientLight`, `DaggerfallLight`, MIT, Daggerfall Workshop), and every number below
// says which of them it came from:
//
//   * **DawnHour 6, DuskHour 18**; it is night when the hour is before six or from six in the
//     evening (`isNight`).
//   * **The sun's arc.** The day fraction is `t = (minute − 360) / 720`, and the unit vector
//     toward the sun is `(cos πt, sin πt, 0)`: it rises in the **east** (+X at dawn), stands
//     **straight up at noon**, and sets in the west. The sun is disabled entirely at night
//     (`sunScale` is zero), exactly as the rig is.
//   * **The light curve.** `SunlightManager.LightCurve`'s Hermite keys — (0, 0), (0.08, 0.36
//     slope 2.8928573), (0.5, 0.9), (0.92, 0.36 slope −2.8928576), (1, 0) — evaluated the way
//     Unity evaluates an `AnimationCurve` (cubic Hermite between keys, clamped outside them).
//     That curve is the whole shape of a day: a slow dawn, a long bright middle, a slow dusk.
//   * **The ambient.** The exterior ambient is a lerp from the night value (0.25) to noon's
//     (0.9) by that curve, which is `PlayerAmbientLight`.
//   * **The sun's colour**, `SunlightRig`'s own (0.8161765, 0.954361, 1) at base intensity 0.6.
//
// ## What is this project's (and why the labels matter)
//
// Arena's palette is dim (`DECISIONS.md` D13: the original brightens it per map with light
// tables this port does not reproduce), so the port's own day ambient is already **larger than
// the rig's** and its sun is warmer — `scenes/interior.js`'s `CITY_AMBIENT`/`CITY_SUN`. Taking
// DFU's absolute values would darken a town this port has measured as correct, so what is
// carried here is the twin's **shape**, and the scene applies it *to the values it already
// had*: `dayWeight` is 1 at noon (the port's own noon, unchanged, byte for byte) and 0 at
// night, with the sun's own curve in between. Three numbers are this project's and are labelled
// where they are used: the night ambient **floor** (a night street must still be walkable —
// Arena has no lantern to light one with), the dusk/dawn **fog colour**, and how far the
// panorama is mixed into that fog at night.
//
// Like every module in `game/`, this one is **pure**: no DOM, no scene, no renderer. It answers
// what the sky is doing at a given minute, and `scenes/interior.js` does the drawing.

/** Minutes in an hour, as every clock in this port counts them. */
export const MINUTES_PER_HOUR = 60;
/** Minutes in a day — the unit a clock and every hour in these tables is written in. */
export const MINUTES_PER_DAY = 1440;

/** The hour the sun rises (DFU `DaggerfallDateTime.DawnHour`). */
export const DAWN_HOUR = 6;
/** The hour the sun sets (DFU `DaggerfallDateTime.DuskHour`). */
export const DUSK_HOUR = 18;

/** `SunlightRig`'s base intensity (the prefab's, carried by the twin). */
export const SUN_RIG_INTENSITY = 0.6;
/** `SunlightRig`'s key light colour, verbatim. */
export const SUN_RIG_COLOR = Object.freeze([0.8161765, 0.954361, 1]);
/** `ExteriorNoonAmbientLight`. */
export const EXTERIOR_NOON_AMBIENT = 0.9;
/** `ExteriorNightAmbientLight` (the settings default `NightAmbientLightScale` is 1). */
export const EXTERIOR_NIGHT_AMBIENT = 0.25;

/**
 * `SunlightManager.LightCurve`'s keys, exactly: `[time, value, inSlope, outSlope]`.
 *
 * The 0.9 at the half-way mark is the reason a noon frame is as bright as it is and a dawn
 * frame is not: the curve reaches 0.36 within the first hour of daylight, holds 0.9 across the
 * middle five hours, and is back to 0.36 an hour before dusk.
 */
export const LIGHT_CURVE = Object.freeze([
  Object.freeze([0, 0, 0, 0]),
  Object.freeze([0.08, 0.36, 2.8928573, 2.8928573]),
  Object.freeze([0.5, 0.9, 0, 0]),
  Object.freeze([0.92, 0.36, -2.8928576, -2.8928576]),
  Object.freeze([1, 0, 0, 0]),
]);

/** The curve's own peak (`LightCurve`'s middle key) — what `dayWeight` divides by. */
export const DAYLIGHT_PEAK = 0.9;

/**
 * The floor of the night ambient, as a share of the port's own day ambient.
 *
 * **This project's number, and it is a deliberate departure.** DFU's night ambient is 0.25
 * against a noon of 0.9 — nearly a third of midday — and it is lit through the night by the
 * city's lanterns, its windows and the twin's own street lights. This port has none of those
 * yet, and Arena's palette is dim to begin with, so a night at a quarter of noon would be a
 * street the player cannot walk. The floor keeps a night town legible while leaving the day
 * exactly as it was.
 */
export const NIGHT_AMBIENT_FLOOR = 0.42;

/**
 * The sun's colour as it touches the horizon, from the twin's own dusk (`sdRiftPass.js`'s
 * `DUSK_LO`, which is Daggerfall Unity's sunrise/sunset hue). Day keeps the port's `CITY_SUN`.
 */
export const HORIZON_SUN_COLOR = Object.freeze([0.98, 0.62, 0.32]);

/** The elevation (0..1 of `sin πt`) below which the horizon colour is reached in full. */
export const HORIZON_BAND = 0.34;

/** The fog at night: near-black, and cold. **This project's.** */
export const NIGHT_FOG_COLOR = Object.freeze([0.05, 0.06, 0.11]);
/** The fog at dusk and dawn: warm, and the same hue the sun's own colour is. **This project's.** */
export const HORIZON_FOG_COLOR = Object.freeze([0.46, 0.30, 0.26]);
/** How far the panorama is mixed into the frame's fog at the darkest hour. **This project's.** */
export const NIGHT_SKY_MIX = 0.66;

/**
 * Unity's `AnimationCurve.Evaluate`: cubic Hermite between the keys, clamped outside them.
 *
 * Ported from the twin (`worldClock.js`'s `evaluateCurve`) because the curve *is* the day: a
 * day assembled from `if (hour > 6)` steps has hard edges at dawn and dusk that a player reads
 * as a light switch being thrown.
 *
 * @param {ReadonlyArray<readonly [number, number, number, number]>} keys `[time, value, in, out]`
 * @param {number} t
 * @returns {number}
 */
export function evaluateCurve(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const [t0, v0, , outSlope] = keys[i];
  const [t1, v1, inSlope] = keys[i + 1];
  const dt = t1 - t0;
  const s = (t - t0) / dt;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0
    + (s3 - 2 * s2 + s) * dt * outSlope
    + (-2 * s3 + 3 * s2) * v1
    + (s3 - s2) * dt * inSlope;
}

/** Non-negative modulo. */
const mod = (n, m) => ((n % m) + m) % m;
/** A value held inside `[lo, hi]`. */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Minutes past midnight for anything that carries a clock.
 *
 * Every function here takes **either** a `livingWorld.timeOfDay` result (anything with a
 * `minutes` field) or a bare minute count, because the two are asked for in different places:
 * a test has a number, and the scene has the clock it already keeps.
 *
 * @param {number|{minutes?: number, minuteOfDay?: number}} clock
 * @returns {number} 0..1439
 */
export function minuteOf(clock) {
  const raw = typeof clock === 'number' ? clock
    : Number(clock?.minuteOfDay ?? clock?.minutes ?? NaN);
  return mod(Math.trunc(Number.isFinite(raw) ? raw : 0), MINUTES_PER_DAY);
}

/** The hour of the day, 0..23. */
export const hourOf = (clock) => Math.floor(minuteOf(clock) / MINUTES_PER_HOUR);

/** Whether the sun is down (DFU `IsNight`: before six, or from six in the evening). */
export function isNight(clock) {
  const hour = hourOf(clock);
  return hour < DAWN_HOUR || hour >= DUSK_HOUR;
}

/** `(minute − dawn) / dayRange`, unclamped — `SunlightManager`'s own `t`. */
export function dayFraction(clock) {
  const dawn = DAWN_HOUR * MINUTES_PER_HOUR;
  const dayRange = DUSK_HOUR * MINUTES_PER_HOUR - dawn;
  return (minuteOf(clock) - dawn) / dayRange;
}

/** The light curve at the clamped day fraction — 0 through the whole night. */
export function daylightScale(clock) {
  return evaluateCurve(LIGHT_CURVE, clamp(dayFraction(clock), 0, 1));
}

/**
 * The sun's own unit vector: dawn at map **east** (+X), noon straight up, dusk in the west.
 *
 * This is DFU's `SunlightManager` arc — its euler `(180t, −90, 0)` points the rig's forward at
 * `(−cos, −sin, 0)(180t)`, and the vector *toward* the sun is the negation. Written once here
 * so the sky, the light and a test can never disagree about where the sun is.
 *
 * @param {number|object} clock
 * @param {Float32Array|number[]} [out] filled in place, so a per-frame caller allocates nothing
 * @returns {Float32Array|number[]}
 */
export function sunDirection(clock, out = new Float32Array(3)) {
  const x = Math.PI * clamp(dayFraction(clock), 0, 1);
  out[0] = Math.cos(x);
  out[1] = Math.sin(x);
  out[2] = 0;
  return out;
}

/** The sun's height above the horizon, 0 at the horizon and 1 at noon. */
export const sunElevation = (clock) => Math.sin(Math.PI * clamp(dayFraction(clock), 0, 1));

/**
 * The sun's contribution: the rig's intensity through the curve, and **nothing at night**.
 *
 * DFU disables the whole rig outside dawn–dusk (`SunlightManager`), which is why this returns
 * exactly zero rather than a small number: a sun below the horizon that still lit the ground
 * is the one thing a night cannot have.
 */
export function sunScale(clock) {
  return isNight(clock) ? 0 : SUN_RIG_INTENSITY * daylightScale(clock);
}

/**
 * The exterior ambient by the curve: DFU's night 0.25 toward its noon 0.9.
 *
 * The lerp factor **is** the light curve, and the curve peaks at 0.9 rather than 1, so the
 * brightest hour of a Daggerfall day is 0.835 — Daggerfall's own arithmetic, carried as it is
 * rather than tidied into a rounder number (the scene does not use this value; it scales its own
 * measured ambient by `dayWeight`, which *is* normalised to its peak, so this port's noon stays
 * exactly what it was).
 */
export function exteriorAmbient(clock) {
  const s = daylightScale(clock);
  return EXTERIOR_NIGHT_AMBIENT + (EXTERIOR_NOON_AMBIENT - EXTERIOR_NIGHT_AMBIENT) * s;
}

/**
 * How much of the day's own light the frame has, 0 at night and **exactly 1 at the curve's
 * peak**.
 *
 * This — not `daylightScale` — is what the scene multiplies its measured day values by, and the
 * distinction is the whole reason a noon frame in this port looks the way it always has: at
 * noon the curve reads 0.9, and dividing by its own peak makes the port's `CITY_AMBIENT` and
 * `CITY_SUN` come out unchanged at midday and fade away from there.
 */
export const dayWeight = (clock) => clamp(daylightScale(clock) / DAYLIGHT_PEAK, 0, 1);

/**
 * The frame's own light, written into a caller's object so a per-frame reader allocates nothing.
 *
 * @param {number|object} clock
 * @param {{sunDir?: Float32Array, sunColor?: Float32Array, minute?: number, hour?: number,
 *   night?: boolean, daylight?: number, dayWeight?: number, elevation?: number,
 *   sunScale?: number, ambientScale?: number}} [out]
 * @returns {object} `ambientScale` is a *share* of the caller's own day ambient (1 at noon,
 *   `NIGHT_AMBIENT_FLOOR` at night); `sunScale` is the same share of the caller's own day sun.
 */
export function lightInto(clock, out = {}) {
  const minute = minuteOf(clock);
  const weight = dayWeight(minute);
  const elevation = sunElevation(minute);
  out.minute = minute;
  out.hour = Math.floor(minute / MINUTES_PER_HOUR);
  out.night = isNight(minute);
  out.daylight = daylightScale(minute);
  out.dayWeight = weight;
  out.elevation = elevation;
  out.sunScale = weight;
  out.ambientScale = NIGHT_AMBIENT_FLOOR + (1 - NIGHT_AMBIENT_FLOOR) * weight;
  // The sun's colour warms as it comes down: the port's own day colour at and above the
  // horizon band, the twin's dusk hue at the horizon. `elevation` is used rather than the hour
  // so that a long northern dusk and a short southern one grey out alike.
  const warmth = clamp(1 - elevation / HORIZON_BAND, 0, 1);
  const sun = (out.sunColor ??= new Float32Array(3));
  for (let i = 0; i < 3; i++) sun[i] = HORIZON_SUN_COLOR[i] * warmth;
  out.sunDir = sunDirection(minute, out.sunDir);
  out.sunWarmth = warmth;
  return out;
}

/**
 * The sky and the fog as the hour has them: what colour the air is, and how much of the
 * panorama that colour hides.
 *
 * `fogMix` is what makes a night *dark*: the panorama is one painted picture of the install's
 * own mountains and clouds (`game/arenaSky.js`) and there is no night copy of it to swap in, so
 * the frame mixes it into the fog colour instead — 0 at noon (the picture exactly as built) and
 * `NIGHT_SKY_MIX` at the dead of night.
 *
 * @param {number|object} clock
 * @param {{fogColor?: Float32Array, clearColor?: Float32Array, fogMix?: number}} [out]
 * @returns {object}
 */
export function skyInto(clock, out = {}) {
  const weight = dayWeight(clock);
  // The horizon's own weight is the sun's height, and **nothing at night**: the elevation is
  // clamped at 0 outside dawn–dusk, so a bare `1 − elevation / band` would paint the maximum
  // sunset over a street at midnight.
  const horizon = isNight(clock) ? 0 : clamp(1 - sunElevation(clock) / HORIZON_BAND, 0, 1);
  const day = out.dayFogColor ?? NIGHT_FOG_COLOR;
  const fog = (out.fogColor ??= new Float32Array(3));
  for (let i = 0; i < 3; i++) {
    // Night → the caller's own day colour → warm at the horizon. At noon this is the day
    // colour *exactly*, which is what keeps the port's measured look unregressed.
    const mixed = NIGHT_FOG_COLOR[i] + (day[i] - NIGHT_FOG_COLOR[i]) * weight;
    fog[i] = mixed + (HORIZON_FOG_COLOR[i] - mixed) * horizon;
  }
  const dayClear = out.dayClearColor ?? NIGHT_FOG_COLOR;
  const clear = (out.clearColor ??= new Float32Array(3));
  for (let i = 0; i < 3; i++) clear[i] = NIGHT_FOG_COLOR[i] + (dayClear[i] - NIGHT_FOG_COLOR[i]) * weight;
  out.fogMix = NIGHT_SKY_MIX * (1 - weight);
  out.dayWeight = weight;
  out.horizon = horizon;
  return out;
}
