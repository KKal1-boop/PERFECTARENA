// @ts-check
// AUDIT 68 S17-gl-program-dup (2026-09-24): ONE COMPILE AND LINK. The
// renderer and eleven foreign passes (the sky, the rain, the wisps, the
// clouds and their noise, the far ring, the bolts, Dynamic Skies, the grass,
// the enhanced sky) each wrote the same createShader / compile / check /
// attach / link / check out by hand, and had drifted only in their error
// prefixes. A leaf with no imports.

/** Compile `vsSrc` and `fsSrc` and link them into a program, in the order
 *  every pass wrote it: createProgram, then per stage createShader,
 *  shaderSource, compileShader, the COMPILE_STATUS check and attachShader,
 *  then linkProgram and the LINK_STATUS check. A fault throws the driver's
 *  log - a constructor fault the boot probe sees - prefixed, when `label` is
 *  given, `${label} shader: ` or `${label} link: `. */
export function buildProgram(gl, vsSrc, fsSrc, label = '') {
  // PERF-COMPILE1 (2026-10-10, stutter): ONE SYNC POINT, NOT THREE. A status query is a round trip that waits for the
  // driver to finish - asked after each compile, it made the vertex stage finish before the fragment stage was even
  // handed over, and the link wait a third. Both stages go in, the link goes in, and the one LINK_STATUS read waits
  // once; the drivers that compile in parallel (ANGLE's worker threads) overlap the stages. A failure still throws the
  // log it threw: a stage that did not compile is read only when the link failed (a compile fault always fails the
  // link), and its log comes first, prefixed `${label} shader: `.
  const prog = gl.createProgram();
  const stage = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(prog, sh);
    return sh;
  };
  const vs = stage(gl.VERTEX_SHADER, vsSrc);
  const fs = stage(gl.FRAGMENT_SHADER, fsSrc);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    for (const sh of [vs, fs]) if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`${label ? `${label} shader: ` : ''}${gl.getShaderInfoLog(sh)}`);
    throw new Error(`${label ? `${label} link: ` : ''}${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

// ── PERFECTARENA: THE INTERIOR LIGHTING CONTRACT ───────────────────────────────
//
// The WORLD shaders this file builds already light an interior: `uAmbient` is the
// warm floor, `uPointLights[16]` / `uPointColors[16]` are LANTERNS AND BRAZIERS with
// the squared-linear falloff below, `uTrilight` splits the ambient sky/ground, and
// `uFogMode`/`uFogColor`/`uFogDensity`/`uFogRange` are the corridor's own haze. So
// nothing here ADDS a uniform to a shader: the laws the shaders interpolate are
// restated as pure JS, where a unit test can hold the two against each other and a
// scene can place a brazier without guessing what the fragment shader will do with it.
//
// This module is a leaf with no imports, which is why the laws live here: a plain
// `node --test` can import this file with no GL and no DOM, and the shader text they
// describe is the text built a few lines above.

/** The point-light cap every classic world shader declares (`uPointLights[16]`,
 *  `uPointColors[16]`). A scene lighting a room must cut its list to this, or the
 *  upload is an INVALID_OPERATION: the arrays are fixed-length. */
export const POINT_LIGHTS_MAX = 16;

/**
 * The shaders' own point-light falloff, term for term.
 *
 * The GLSL (renderer.js, every program that takes the lantern loop):
 *
 *   float att = clamp(1.0 - d / uPointLights[i].w, 0.0, 1.0);
 *   pointAcc += att * att * max(dot(n, L / max(d, 1e-4)), 0.0) * uPointColors[i];
 *
 * So the RAMPS in `att` and the SQUARE is what makes a lantern die in its own
 * radius: at the range it is exactly 0 (not merely dark), and a light placed
 * further than its range away contributes nothing at all. A JS caller sizing a
 * brazier's range wants this number, not an invented curve.
 *
 * @param {number} distance  world units from the light
 * @param {number} range     `uPointLights[i].w` - the light's radius, in the same units
 * @returns {number} 1 at the light, 0 at and beyond the range
 */
export function pointLightFalloff(distance, range) {
  const r = Math.max(Number(range) || 0, 1e-4);
  const d = Math.max(Number(distance) || 0, 0);
  const att = Math.max(0, Math.min(1, 1 - d / r));
  return att * att;
}

/**
 * The INTERIOR WRAP TERM: a wall facing away from a torch is dim, not black.
 *
 * `wrap` 0 is EXACTLY the shader's `max(dot(n, dir), 0.0)` - the same number,
 * bit for bit - so a scene that never asks for wrap keeps today's picture, and
 * an interior that asks for 0.4 lifts the term to `(N.L + 0.4) / 1.4` before the
 * clamp, which is the standard half-Lambert softening: a surface at 90 degrees
 * to the light reads ~0.29 instead of 0.
 *
 * The GLSL twin is `WRAP_GLSL` below.
 *
 * @param {number} nDotL  the dot product of the surface normal and the light direction
 * @param {number} wrap   how much of the term carries past the terminator (0 = off)
 * @returns {number} 0…1
 */
export function wrapDiffuse(nDotL, wrap) {
  const d = Number(nDotL) || 0;
  const w = Math.max(0, Number(wrap) || 0);
  if (w === 0) return Math.max(d, 0);
  return Math.max((d + w) / (1 + w), 0);
}

/**
 * THE GLSL FOR THAT TERM, for a shader template to interpolate.
 *
 * `uWrap` defaults to 0 as GLSL requires of an unset float, so a program that
 * declares this block and is never given a value draws exactly what it drew
 * before: no picture anywhere in this tree changes until a host sets one.
 *
 * A shader carrying this must be BUILT with it interpolated (the same rule
 * every other block in this renderer obeys - a GLSL declaration is visible only
 * to the compilation unit that contains it), and its `uWrap` must be looked up
 * where that program's other lighting uniforms are (`_installWorldSet` for the
 * mesh, character and terrain programs).
 */
export const WRAP_GLSL = `uniform float uWrap;   // PERFECTARENA: 0 = max(dot(n, dir), 0.0), the pre-wrap law exactly
float wrapDiffuseAt(vec3 n, vec3 dir) {
  float d = dot(n, dir);
  return uWrap > 0.0 ? max((d + uWrap) / (1.0 + uWrap), 0.0) : max(d, 0.0);
}`;

/**
 * The art names that are their own light: a brazier, a torch, a fire, a candle, a
 * lantern, a campfire.
 *
 * A FILENAME HEURISTIC, and said out loud as one: this port reads the original's
 * own archives, so an emissive prop can only be known by the name the artists gave
 * its art (`T_TORCH...`, `...BRAZIER...`, `HEARTH...`), not by a material flag - that
 * flag would be in `A.EXE`, which this data set does not carry (D11).
 *
 * THE WORD MUST BE DELIMITED - the start of the stem or a character that is not a
 * letter. The list is short and the art names are not, so a substring test would
 * light things it has no business lighting: `WALLFIREPROOF` contains FIRE, and a
 * wall that glows is a worse error than a torch that does not, because the wall is
 * what the whole room is made of. The cost is a bare name with a letter run into it
 * (`TFIREPIT`), which this build does not light - the trade is stated rather than
 * hidden, and `isEmissiveArt` is the one place to widen if a real name turns up.
 */
export const EMISSIVE_ART = /(?:^|[^A-Z])(TORCH|BRAZIER|FIRE|CANDLE|LANTERN|CAMPFIRE|HEARTH)/;

/**
 * Is this archive entry / material key its own light?
 *
 * Accepts either an archive name (`T_TORCH.IMG`, `TFIREPIT.IMG`) or a renderer
 * material key (`T_TORCH.IMG#2`, `archive_record`), because both shapes reach the
 * place that decides emission: the stem is what is tested.
 *
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
export function isEmissiveArt(name) {
  const text = String(name ?? '').trim().toUpperCase();
  if (!text) return false;
  const stem = text.split('#')[0].replace(/\.(IMG|SET|CFA|CIF|MIF|RCI)$/i, '');
  if (!stem) return false;
  return EMISSIVE_ART.test(stem);
}

/** The interior haze mode: `exp2`, DS1's FogMode.ExponentialSquared - the one a
 *  closed room wants, because it closes fully over a distance instead of the
 *  exponential's asymptotic tail (a corridor must END, not fade forever). */
export const INTERIOR_FOG_MODE = 3;

/** An interior's fog colour: black, which is the colour an interior is CLEARED
 *  to (`INTERIOR_CLEAR` in renderer.js) - so the far end of a dark corridor ends
 *  in the same black the room is made of, with no visible seam. */
export const INTERIOR_FOG_COLOR = Object.freeze([0, 0, 0]);

/**
 * The JS twin of `fogFactorAt` in `fogGlsl.js` - the law every world program
 * interpolates, restated so it can be held to the shader's own numbers.
 *
 * 1 is unfogged, 0 is all fog. Mode 0 off, 1 linear over `[start, end]`,
 * 2 exponential, 3 exponential-squared.
 *
 * @param {number} distance  world units from the camera
 * @param {{mode?: number, density?: number, range?: [number, number]}} [fog]
 * @returns {number}
 */
export function fogFactorAtDistance(distance, fog = {}) {
  const mode = fog.mode ?? 0;
  if (mode === 0) return 1;
  const d = Math.max(Number(distance) || 0, 0);
  const density = Number(fog.density) || 0;
  const range = fog.range ?? [0, 1];
  if (mode === 1) {
    const span = Math.max((range[1] ?? 1) - (range[0] ?? 0), 1e-4);
    return Math.max(0, Math.min(1, ((range[1] ?? 1) - d) / span));
  }
  if (mode === 3) { const f = density * d; return Math.exp(-f * f); }
  return Math.exp(-density * d);
}

/**
 * An interior's fog uniforms, ready to hand to `setFog`.
 *
 * `far` IS THE DESIGN NUMBER, not a density: it is the distance at which the
 * haze has swallowed exactly HALF the colour - derived rather than dialled,
 * because `exp(-(d * far)^2) = 1/2` gives `d = sqrt(ln 2) / far`. `far = 6` (the
 * width of a house) leaves a wall at 3 m at `exp(-(3d)^2) = 0.84` of its own
 * colour and the far wall at 0.5; `far = 40` does the same down a dungeon
 * corridor, and past it the `exp2` mode closes to nothing instead of the
 * exponential's asymptotic tail, which is what gives a corridor an end.
 *
 * @param {{far: number, near?: number, color?: number[]}} opts
 * @returns {{mode: number, color: number[]|readonly number[], density: number, range: [number, number]}}
 */
export function interiorFog({ far, near = 0, color = INTERIOR_FOG_COLOR } = {}) {
  const end = Math.max(Number(far) || 0, 1e-3);
  const start = Math.max(0, Math.min(Number(near) || 0, end * 0.5));
  return {
    mode: INTERIOR_FOG_MODE,
    color: color ?? INTERIOR_FOG_COLOR,
    density: Math.sqrt(Math.LN2) / end,
    range: [start, end],
  };
}
