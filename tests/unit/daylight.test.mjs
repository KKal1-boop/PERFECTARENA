// Run:  node --test tests/unit/daylight.test.mjs
//
// The sun over Tamriel (`src/game/daylight.js`): the twin's own day/night law — Daggerfall
// Unity's `SunlightManager` arc, its `LightCurve`, and `PlayerAmbientLight` — carried so a town
// in this port has an evening. The laws a scene depends on, and that a wrong number here would
// quietly ruin:
//
//   * the sun **rises in the east and sets in the west**, and at noon it is straight overhead
//     (the arc is the whole reason a wall's east face is lit in the morning);
//   * the day's light curve is **not a switch**: it is 0 at dawn, most of the way up within the
//     first hour, holds through the middle, and is back down before dusk (DFU's Hermite keys);
//   * the sun is **exactly zero at night** — a sun below the horizon that still lit the ground
//     is the one thing a night cannot have;
//   * `dayWeight` is **exactly 1 at the curve's peak**, which is what makes the scene's own
//     measured noon come out unchanged when this port scales it by the hour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAWN_HOUR, DAYLIGHT_PEAK, DUSK_HOUR, HORIZON_SUN_COLOR, LIGHT_CURVE, MINUTES_PER_DAY,
  NIGHT_AMBIENT_FLOOR, NIGHT_FOG_COLOR, SUN_RIG_COLOR, SUN_RIG_INTENSITY, dayFraction, dayWeight,
  daylightScale, evaluateCurve, exteriorAmbient, hourOf, isNight, lightInto, minuteOf, skyInto,
  sunDirection, sunElevation, sunScale,
} from '../../src/game/daylight.js';

const at = (hour, minute = 0) => hour * 60 + minute;

// ── the clock these answers read ─────────────────────────────────────────────

test('a minute of the day is read out of anything that carries a clock', async () => {
  assert.equal(minuteOf(at(10)), 600, 'a bare minute count');
  assert.equal(minuteOf({ minutes: 600, hour: 10 }), 600, 'a `timeOfDay` result, which is what the scene passes');
  assert.equal(minuteOf({ minuteOfDay: 90 }), 90);
  assert.equal(minuteOf(at(25) + MINUTES_PER_DAY), minuteOf(at(25)), 'and it wraps');
  assert.equal(minuteOf(-30), MINUTES_PER_DAY - 30, 'a negative clock wraps rather than going negative');
  assert.equal(minuteOf(undefined), 0, 'and nothing at all is midnight');
  assert.equal(hourOf(at(13, 40)), 13);
});

// ── the sun's arc ────────────────────────────────────────────────────────────

test('the sun rises in the east, stands overhead at noon and sets in the west', async () => {
  assert.equal(DAWN_HOUR, 6, 'DFU\'s DawnHour');
  assert.equal(DUSK_HOUR, 18, 'and its DuskHour');
  // Dawn: the sun is on the +X horizon, coming up. Noon: straight up. Dusk: the −X horizon.
  const dawn = sunDirection(at(DAWN_HOUR));
  assert.ok(Math.abs(dawn[0] - 1) < 1e-6 && Math.abs(dawn[1]) < 1e-6, `dawn at east: ${Array.from(dawn)}`);
  const noon = sunDirection(at(12));
  assert.ok(noon[1] > 0.999, `noon straight up: ${Array.from(noon)}`);
  assert.ok(Math.abs(noon[0]) < 1e-6);
  const dusk = sunDirection(at(DUSK_HOUR));
  assert.ok(Math.abs(dusk[0] + 1) < 1e-6 && Math.abs(dusk[1]) < 1e-6, `dusk in the west: ${Array.from(dusk)}`);
  // It is a unit vector at every hour, and it always looks *toward* the sun.
  for (let minute = 0; minute < MINUTES_PER_DAY; minute += 37) {
    const d = sunDirection(minute);
    const length = Math.hypot(d[0], d[1], d[2]);
    assert.ok(Math.abs(length - 1) < 1e-6, `unit at ${minute}: ${length}`);
    assert.ok(d[2] === 0, 'the arc lies in one plane');
  }
  // The elevation rises to noon and falls away again, and is zero (never negative) through the
  // night — `sin π` is 1.2e-16 in binary floating point, which is the clamp doing its job rather
  // than a horizon the sun dips under.
  assert.ok(sunElevation(at(9)) > 0 && sunElevation(at(9)) < sunElevation(at(12)));
  assert.ok(Math.abs(sunElevation(at(22))) < 1e-12, `clamped under the horizon: ${sunElevation(at(22))}`);
  assert.ok(Math.abs(sunElevation(at(2))) < 1e-12);
  assert.ok(sunElevation(at(22)) >= 0, 'never negative');
  // A caller that passes its own array gets it back filled — the per-frame path allocates nothing.
  const out = new Float32Array(3);
  assert.equal(sunDirection(at(12), out), out);
  assert.ok(out[1] > 0.999);
});

// ── the light curve ──────────────────────────────────────────────────────────

test('the day is a curve, not a switch: DFU\'s own keys, evaluated as Unity evaluates them', async () => {
  assert.equal(LIGHT_CURVE.length, 5, 'the rig\'s five keys');
  assert.deepEqual(LIGHT_CURVE.map((key) => key[1]), [0, 0.36, 0.9, 0.36, 0], 'their values, in order');
  assert.equal(DAYLIGHT_PEAK, 0.9);
  // At the keys themselves the curve is exactly their values, and outside them it is clamped.
  for (const [t, value] of LIGHT_CURVE) assert.ok(Math.abs(evaluateCurve(LIGHT_CURVE, t) - value) < 1e-9);
  assert.equal(evaluateCurve(LIGHT_CURVE, -3), 0);
  assert.equal(evaluateCurve(LIGHT_CURVE, 4), 0);
  // The onset is steep but smooth: a fifth of the way to noon the curve has most of the day's
  // light already, and it is still rising — the same shape as the `LightCurve` the sun rig uses.
  assert.ok(daylightScale(at(7)) > 0.3 && daylightScale(at(7)) < 0.5, `${daylightScale(at(7))}`);
  assert.ok(daylightScale(at(10)) > daylightScale(at(7)), 'the morning gets brighter');
  // **Zero through the entire night**, at both ends of it.
  assert.equal(daylightScale(at(DAWN_HOUR)), 0, 'the sun rises from nothing');
  assert.equal(daylightScale(at(0)), 0);
  assert.equal(daylightScale(at(23)), 0);
  assert.equal(daylightScale(at(DUSK_HOUR)), 0, 'and sets to nothing');
  assert.equal(isNight(at(23)), true);
  assert.equal(isNight(at(5, 59)), true);
  assert.equal(isNight(at(6)), false);
  assert.equal(isNight(at(17, 59)), false);
  assert.equal(isNight(at(18)), true);
  assert.equal(dayFraction(at(12)), 0.5, 'noon is the middle of the sun\'s own day');
});

test('the sun contributes nothing at night, and the ambient still never goes dark', async () => {
  assert.equal(sunScale(at(23)), 0, 'the rig is disabled outside dawn–dusk');
  assert.equal(sunScale(at(12)), SUN_RIG_INTENSITY * DAYLIGHT_PEAK, 'and is the rig\'s own intensity at noon');
  assert.ok(sunScale(at(7)) > 0 && sunScale(at(7)) < sunScale(at(12)), 'rising through the morning');
  // The ambient lerps from DFU's night value toward its noon value by the curve, which is the
  // twin's own arithmetic (`night + (noon − night) * daylightScale`): at its brightest the curve
  // reads 0.9, so the day's ambient comes out at 0.25 + 0.65 × 0.9 = 0.835 and never reaches the
  // 0.9 step of the lerp. Keeping that oddity is the point — it is Daggerfall's own light.
  assert.ok(Math.abs(exteriorAmbient(at(23)) - 0.25) < 1e-9, 'the night end is exact');
  assert.ok(Math.abs(exteriorAmbient(at(12)) - (0.25 + 0.65 * DAYLIGHT_PEAK)) < 1e-9);
  assert.ok(exteriorAmbient(at(7)) < exteriorAmbient(at(12)), 'and it brightens through the morning');
  // …and `dayWeight` is the same shape, normalised so that the peak is exactly one: the scene
  // multiplies its own measured noon by this, so a peak of 0.9999 would be a subtle regression in
  // every frame of the game.
  assert.equal(dayWeight(at(12)), 1, 'high noon is exactly the caller\'s own light');
  assert.equal(dayWeight(at(23)), 0, 'and midnight is none of it');
  assert.ok(dayWeight(at(7)) < 1 && dayWeight(at(7)) > 0);
  assert.ok(NIGHT_AMBIENT_FLOOR > 0 && NIGHT_AMBIENT_FLOOR < 1, 'a night street is walkable');
});

// ── the frame's own light ────────────────────────────────────────────────────

test('the frame\'s light is written in place, and its sun warms as it comes down', async () => {
  const scratch = { sunColor: new Float32Array(3), sunDir: new Float32Array(3) };
  const noon = lightInto(at(12), scratch);
  assert.equal(noon.minute, 720);
  assert.equal(noon.hour, 12);
  assert.equal(noon.night, false);
  assert.equal(noon.dayWeight, 1);
  assert.equal(noon.ambientScale, 1, 'the scene\'s own noon ambient, untouched');
  assert.equal(noon.sunScale, 1);
  assert.equal(noon.sunWarmth, 0, 'and the noon sun is the port\'s own colour');
  for (let i = 0; i < 3; i++) assert.equal(noon.sunColor[i], 0, 'no horizon tint at noon');
  // The same scratch object is filled again rather than a new one made: the per-frame rule.
  const same = lightInto(at(23), scratch);
  assert.equal(same, noon, 'the caller\'s own object comes back');
  assert.equal(same.night, true);
  assert.equal(same.sunScale, 0, 'no sun at midnight');
  assert.equal(same.ambientScale, NIGHT_AMBIENT_FLOOR);
  // At the horizon the sun is the twin's dusk hue, and it is at its warmest.
  const dusk = lightInto(at(17, 55), scratch);
  assert.ok(dusk.sunWarmth > 0.9, `warm at dusk: ${dusk.sunWarmth}`);
  assert.ok(dusk.sunColor[0] > dusk.sunColor[1] && dusk.sunColor[1] > dusk.sunColor[2],
    `the sun comes down warm: ${Array.from(dusk.sunColor)}`);
  assert.ok(HORIZON_SUN_COLOR[0] > HORIZON_SUN_COLOR[2], 'and the hue it comes down to is a sunset one');
  assert.ok(SUN_RIG_COLOR[2] >= SUN_RIG_COLOR[0], 'whereas the rig\'s own noon colour is a cold one');
});

test('the sky and the fog: the port\'s own noon, a warm horizon, and a dark night', async () => {
  const day = new Float32Array([0.60, 0.66, 0.76]);
  const clear = new Float32Array([0.53, 0.7, 0.92]);
  const scratch = { dayFogColor: day, dayClearColor: clear, fogColor: new Float32Array(3), clearColor: new Float32Array(4) };
  const noon = skyInto(at(12), scratch);
  assert.deepEqual(Array.from(noon.fogColor), Array.from(day), 'noon is the scene\'s own fog, to the byte');
  assert.equal(noon.fogMix, 0, 'and the panorama is not hidden at all at noon');
  assert.deepEqual(Array.from(noon.clearColor).slice(0, 3), Array.from(clear).slice(0, 3));
  // **The caller's own object comes back filled**, the per-frame rule — which means every number
  // here has to be *read* before the next call overwrites it (and a `Float32Array` holds 0.06 as
  // 0.059999998, so the channels are compared with a tolerance rather than by value).
  const night = skyInto(at(1), scratch);
  const nightFog = Array.from(night.fogColor);
  const nightMix = night.fogMix;
  const nightHorizon = night.horizon;
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(nightFog[i] - NIGHT_FOG_COLOR[i]) < 1e-6, `night fog ${i}: ${nightFog[i]}`);
  assert.ok(nightMix > 0.5, `and the panorama is mixed into it: ${nightMix}`);
  assert.ok(nightMix <= 1);
  assert.equal(nightHorizon, 0, 'and nothing at midnight is warm');
  // Dawn: warmer than either, because the sun is on the horizon.
  const dawn = skyInto(at(6, 5), scratch);
  assert.ok(dawn.fogColor[0] > dawn.fogColor[2], `the horizon is warm: ${Array.from(dawn.fogColor)}`);
  assert.ok(dawn.horizon > 0.5, `${dawn.horizon}`);
  assert.ok(dawn.fogMix < nightMix, 'and the sky is less hidden than at night');
  // **Nothing warm at midnight**: the elevation is clamped outside the day, so a bare
  // `1 − elevation` would have painted a sunset over a street at one in the morning.
  assert.equal(skyInto(at(23), scratch).horizon, 0);
  assert.equal(skyInto(at(3), scratch).horizon, 0);
});
