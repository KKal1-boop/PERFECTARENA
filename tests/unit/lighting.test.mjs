// THE INTERIOR LIGHTING LAWS, AND THE SHADER TEXT THEY DESCRIBE.
//
//   node --test tests/unit/lighting.test.mjs
//
// The classic world shaders already light an interior: `uAmbient`, sixteen point
// lights with a squared-linear falloff, `uTrilight`, and five fog modes. What this
// project kept getting wrong is not the shader but the NUMBERS a caller hands it -
// a brazier whose range is guessed, a corridor fog dialled instead of derived, a
// room lit as if the sun were somewhere in it. So the laws live as pure JS
// (`src/engine/render/glProgram.js`, a leaf with no imports) and this file holds
// them to the GLSL they claim to be, by reading the shader source as text.
//
// Two halves, and both are needed:
//
//   * the ARITHMETIC - attenuation monotone and exactly 0 at the range, the wrap
//     term identical to today's clamp at wrap 0, the fog factor 1 unfogged, 0 all
//     fog, 1/2 at the interior payload's own `far`;
//   * the PIN - the JS cap is the shader's `[16]`, the falloff law is the shader's
//     own `att * att` line, the fog mode is `fogGlsl.js`'s `exp2` arm, and the
//     emissive heuristic has a real home in the renderer (`emissionWhite` /
//     `emissionTextures`) rather than being a list nobody consults.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EMISSIVE_ART, INTERIOR_FOG_COLOR, INTERIOR_FOG_MODE, POINT_LIGHTS_MAX, WRAP_GLSL,
  fogFactorAtDistance, interiorFog, isEmissiveArt, pointLightFalloff, wrapDiffuse,
} from '../../src/engine/render/glProgram.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDERER = fs.readFileSync(path.join(ROOT, 'src', 'engine', 'render', 'renderer.js'), 'utf8');
const FOG_GLSL = fs.readFileSync(path.join(ROOT, 'src', 'engine', 'render', 'fogGlsl.js'), 'utf8');

// ── the point lights: the shader's own falloff ───────────────────────────────

test('a point light is 1 at its own centre, falls, and is exactly 0 at its range', () => {
  const range = 12;
  assert.equal(pointLightFalloff(0, range), 1);
  let previous = 1;
  for (let d = 0; d <= range; d += 0.5) {
    const att = pointLightFalloff(d, range);
    assert.ok(att <= previous, `falloff rose at ${d}: ${att} > ${previous}`);
    previous = att;
  }
  assert.equal(pointLightFalloff(range, range), 0, 'a light at its own range still contributes');
  assert.equal(pointLightFalloff(range * 3, range), 0, 'a light beyond its range contributes');
});

test('the falloff is the shader\'s own att * att, not a lookalike curve', () => {
  // The GLSL (renderer.js, mesh/character/terrain/billboard programs):
  //   float att = clamp(1.0 - d / uPointLights[i].w, 0.0, 1.0);
  //   pointAcc += att * att * max(dot(n, L / max(d, 1e-4)), 0.0) * uPointColors[i];
  assert.match(RENDERER, /float att = clamp\(1\.0 - d \/ uPointLights\[i\]\.w, 0\.0, 1\.0\);/);
  assert.match(RENDERER, /pointAcc \+= att \* att \* max\(dot\(n, L \/ max\(d, 1e-4\)\), 0\.0\) \* uPointColors\[i\];/);
  for (const [d, range] of [[0, 8], [2, 8], [7.5, 8], [4, 12], [11.9, 12], [0.25, 2]]) {
    const att = Math.max(0, Math.min(1, 1 - d / range));
    assert.equal(pointLightFalloff(d, range), att * att, `mismatch at ${d}/${range}`);
  }
});

test('the JS cap is the shader\'s own array length', () => {
  assert.equal(POINT_LIGHTS_MAX, 16);
  assert.match(RENDERER, /uniform vec4 uPointLights\[16\];/);
  assert.match(RENDERER, /uniform vec3 uPointColors\[16\];/);
  assert.match(RENDERER, /const CLASSIC_MAX_LIGHTS = 16;/);
  // and every shader that walks the loop reads the count the renderer uploads
  assert.match(RENDERER, /if \(i >= uPointCount\) break;/);
});

test('a point light with no range is not a division by zero', () => {
  assert.equal(pointLightFalloff(1, 0), 0);
  assert.ok(Number.isFinite(pointLightFalloff(0, 0)));
  assert.ok(Number.isFinite(pointLightFalloff(-5, 4)));
});

// ── the interior wrap term ───────────────────────────────────────────────────

test('wrap 0 is the pre-wrap law exactly - max(dot, 0)', () => {
  assert.match(RENDERER, /float diff = max\(dot\(n, uLightDir\), 0\.0\);/);
  for (const d of [-1, -0.5, -1e-9, 0, 0.25, 0.5, 1, 1.5]) {
    assert.equal(wrapDiffuse(d, 0), Math.max(d, 0), `wrap 0 changed ${d}`);
  }
});

test('wrap lifts a wall facing away from the light, and never dims a lit one', () => {
  // A wall turned a little away from the light is lifted by the wrap...
  const away = wrapDiffuse(-0.2, 0.4);
  assert.ok(away > 0 && away < 0.5, `a facing-away wall read ${away}`);
  // ...and one turned further away than the wrap reaches stays dark (the law's own edge).
  assert.equal(wrapDiffuse(-0.5, 0.4), 0);
  assert.equal(wrapDiffuse(0, 0.4), 0.4 / 1.4);
  assert.equal(wrapDiffuse(1, 0.4), 1);
  // monotone in the wrap itself, or a dial would not be a dial
  let previous = -1;
  for (const w of [0, 0.1, 0.2, 0.4, 0.7]) {
    const v = wrapDiffuse(-0.6, w);
    assert.ok(v >= previous, `wrap is not monotone at ${w}`);
    previous = v;
  }
});

test('the GLSL block says what the JS law does', () => {
  assert.match(WRAP_GLSL, /uniform float uWrap;/);
  // the shader's branch, and the JS's, are the same expression
  assert.match(WRAP_GLSL, /uWrap > 0\.0 \? max\(\(d \+ uWrap\) \/ \(1\.0 \+ uWrap\), 0\.0\) : max\(d, 0\.0\)/);
  for (const [d, w] of [[-0.9, 0.3], [0, 0.5], [0.2, 0.8], [1, 0.1]]) {
    assert.equal(wrapDiffuse(d, w), Math.max((d + w) / (1 + w), 0));
  }
  // a program that declares it and is never given a value: GLSL floats default to 0,
  // and 0 is the branch that reproduces the shader's own clamp.
  assert.match(WRAP_GLSL, /0 = max\(dot\(n, dir\), 0\.0\)/);
});

// ── the emissive props ───────────────────────────────────────────────────────

test('a brazier, a torch, a candle, a lantern and a campfire are their own light', () => {
  for (const name of ['T_TORCH.IMG', 'T_BRAZIER.IMG', 'T_FIREPIT.IMG', 'T_CANDLE.IMG',
    'T_LANTERN.IMG', 'CAMPFIRE.IMG', 'HEARTH.IMG', 'T_TORCH.IMG#2', 'TORCH.SET',
    'T_CAMPFIRE.IMG', 'CANDLE.SET']) {
    assert.equal(isEmissiveArt(name), true, `${name} was not read as emissive`);
  }
});

test('a wall, a fence, a bridge and mortar are not', () => {
  for (const name of ['WALL00I0.IMG', 'T_WALL30.IMG', 'T_NBRIDG.IMG', 'T_CITYWL.IMG',
    'PGATE.IMG', 'TLAUNDRY.IMG', 'MORTAR.IMG', 'T_DEQ.IMG', '', '   ', null, undefined]) {
    assert.equal(isEmissiveArt(name), false, `${name} was read as emissive`);
  }
});

test('the heuristic is a name test, and it is case- and suffix-blind', () => {
  assert.equal(isEmissiveArt('t_torch.img'), true);
  assert.equal(isEmissiveArt('  T_BRAZIER.IMG  '), true);
  assert.equal(isEmissiveArt('T_FIREPLACE.IMG#7'), true);
  assert.equal(isEmissiveArt('T_BRAZIER'), true, 'a bare stem is what a material key carries');
});

test('the word must be delimited, so a wall whose NAME merely contains FIRE stays a wall', () => {
  // The trade, stated on purpose: a glowing wall is worse than a dim torch, because
  // the wall is what the room is made of. A word run into a letter is not the art's word.
  assert.equal(isEmissiveArt('WALLFIREPROOF.IMG'), false);
  assert.equal(isEmissiveArt('T_WOODENFIREWALL.IMG'), false);
  assert.equal(isEmissiveArt('MORTARFIRE.IMG'), false);
  // and the honest cost of that rule: a name with the word run into a letter is NOT lit
  assert.equal(isEmissiveArt('TFIREPIT.IMG'), false, 'a run-in name is the trade this rule makes');
  // while the delimited spellings of the same props are
  assert.equal(isEmissiveArt('T_FIREPIT.IMG'), true);
  assert.equal(isEmissiveArt('T_FIRE_01.IMG'), true);
  assert.equal(EMISSIVE_ART.test('WALLFIREPROOF'), false);
});

test('the renderer has a real home for an emissive decision', () => {
  // A heuristic nobody consults is a comment. The mesh path keeps the auto-emissive
  // keys in `emissionWhite` (MaterialReader.cs:448-453's EmissionColor = Color.white)
  // and the window masks in `emissionTextures` - that Set is where a brazier's own
  // albedo becomes its emission, and where `isEmissiveArt` belongs.
  assert.match(RENDERER, /this\.emissionTextures = new Map\(\);/);
  assert.match(RENDERER, /this\.emissionWhite = new Set\(\);/);
  assert.match(RENDERER, /uniform vec3 uEmissionColor;/);
  assert.match(RENDERER, /uniform sampler2D uEmissionTex;/);
});

// ── the interior fog ─────────────────────────────────────────────────────────

test('fog mode 0 is no fog at any distance', () => {
  for (const d of [0, 1, 100, 1e6]) assert.equal(fogFactorAtDistance(d, { mode: 0 }), 1);
});

test('linear fog is 1 at its near plane and 0 at its far one', () => {
  const fog = { mode: 1, range: [5, 45] };
  assert.equal(fogFactorAtDistance(5, fog), 1);
  assert.equal(fogFactorAtDistance(45, fog), 0);
  assert.equal(fogFactorAtDistance(0, fog), 1, 'closer than near is fully unfogged');
  assert.equal(fogFactorAtDistance(1000, fog), 0, 'past far is fully fogged');
  assert.equal(fogFactorAtDistance(25, fog), 0.5);
});

test('exp2 closes monotonically and reaches exactly half at the payload\'s own far', () => {
  // the shader's arm, which is what this mode means
  assert.match(FOG_GLSL, /if \(uFogMode == 3\) \{ float f = uFogDensity \* d; return exp\(-f \* f\); \}/);
  for (const far of [6, 18, 40, 120]) {
    const fog = interiorFog({ far });
    assert.equal(fog.mode, INTERIOR_FOG_MODE);
    const half = fogFactorAtDistance(far, fog);
    assert.ok(Math.abs(half - 0.5) < 1e-12, `far ${far} read ${half} instead of 1/2`);
    let previous = 1;
    for (let d = 0; d <= far * 2; d += far / 20) {
      const f = fogFactorAtDistance(d, fog);
      assert.ok(f <= previous + 1e-12, `fog rose at ${d}`);
      previous = f;
      assert.ok(f >= 0 && f <= 1, `fog left 0…1 at ${d}: ${f}`);
    }
    // exp2's own tail: at twice the design distance a ninth of the colour survives, at
    // three times it is under two percent - a corridor ends, and the numbers are the law's
    assert.ok(fogFactorAtDistance(far * 2, fog) < 0.07, 'twice the far distance is not closed enough');
    assert.ok(fogFactorAtDistance(far * 3, fog) < 0.01, 'three times the far distance must be gone');
    // and a room of that width reads its own half-way wall at most of its colour
    assert.ok(fogFactorAtDistance(far / 2, fog) > 0.8, 'a wall in the middle of the room is not hazy');
  }
});

test('an interior\'s fog colour is the colour an interior is cleared to', () => {
  assert.deepEqual([...INTERIOR_FOG_COLOR], [0, 0, 0]);
  assert.match(RENDERER, /export const INTERIOR_CLEAR = Object\.freeze\(\[0, 0, 0, 1\.0\]\);/);
  assert.deepEqual([...interiorFog({ far: 20 }).color], [0, 0, 0]);
});

test('interiorFog derives its density, and survives a nonsense far', () => {
  const fog = interiorFog({ far: 30, near: 2 });
  assert.equal(fog.density, Math.sqrt(Math.LN2) / 30);
  assert.deepEqual(fog.range, [2, 30]);
  // near is clamped to the room's front half - a near plane past half the far makes
  // the exp2 mode's own near band meaningless
  assert.deepEqual(interiorFog({ far: 10, near: 9 }).range, [5, 10]);
  for (const far of [0, -4, NaN, undefined]) {
    const f = interiorFog({ far });
    assert.ok(f.density > 0 && Number.isFinite(f.density), `far ${far} gave density ${f.density}`);
    assert.ok(f.range[1] > 0);
  }
});
