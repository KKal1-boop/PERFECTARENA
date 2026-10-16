// Uses the copied Daggerfall renderer's sixteen-light contract. Decorative scene lights
// are reconstructed; source positions come from Arena flats and actual city doorways.
import { CombatFx } from './combatFx.js';

export const SCENE_LIGHT_LIMIT = 16;
export const AMBIENT_PARTICLE_LIMIT = 64;

/**
 * The air of a level, by the **kind of place** it is.
 *
 * Arena's dungeons and building interiors are drawn dark: the original lights a room with its
 * own ambient plus whatever torch is near, and the far end of a corridor simply goes black. This
 * port's `exp2` fog is what stands in for that falloff (`renderer.setFog`, one call per level),
 * and it had a single number for every enclosed level — `0.012` — which is *no visible fog at
 * all*: `exp(−(0.012·d)²)` keeps 94 % of the light at 20 m and 70 % at 50 m, so a dungeon's
 * corridors read as evenly lit to the horizon, which is the owner's report "there is no fog in
 * dungeons".
 *
 * `enclosed` at **0.040** puts the falloff where a torch's does — 85 % at 10 m, 53 % at 20 m,
 * **24 % at 30 m**, 2 % at 50 m — while a city keeps sight of the far street (0.0045 keeps 96 % at
 * 20 m) and a wilderness a little further still (0.0030). The densities are this project's own
 * (Arena's are inside `A.EXE`, D11); what is measured is the falloff they produce.
 */
export const LEVEL_FOG = Object.freeze({
  enclosed: Object.freeze({ density: 0.040, colour: Object.freeze([0.07, 0.07, 0.09]) }),
  city: Object.freeze({ density: 0.0045, colour: Object.freeze([0.60, 0.66, 0.76]) }),
  wild: Object.freeze({ density: 0.0030, colour: Object.freeze([0.60, 0.66, 0.76]) }),
});

/**
 * A level's fog: its own kind's density and colour, or the caller's override (`?fog=`).
 *
 * @param {{outside?: boolean, wild?: boolean, override?: number}} [opts]
 * @returns {{kind: 'enclosed'|'city'|'wild', density: number, colour: Float32Array}}
 */
export function fogForLevel({ outside = false, wild = false, override = Number.NaN } = {}) {
  const kind = wild ? 'wild' : outside ? 'city' : 'enclosed';
  const base = LEVEL_FOG[kind];
  return {
    kind,
    density: Number.isFinite(override) ? Number(override) : base.density,
    colour: Float32Array.from(base.colour),
  };
}

/**
 * How much light an `exp2` fog of this density leaves at a distance — the law above, as a
 * number a test (or a person) can check before believing a screenshot.
 *
 * @param {number} density @param {number} metres
 * @returns {number} 0…1
 */
export function fogTransmission(density, metres) {
  const f = density * metres;
  return Math.exp(-f * f);
}
const FIRE_ART = /(TORCH|BRAZ|FIRE|CANDLE|LANTERN|CHAOS)/;

export function sceneLightSources(flats = [], doors = [], cellSize = 2.5) {
  const lights = flats.filter((flat) => FIRE_ART.test(String(flat.name).toUpperCase())).map((flat) => ({
    x: (flat.row + 0.5) * cellSize, y: flat.baseY ?? 3.6, z: (flat.col + 0.5) * cellSize,
    range: 8, colour: [0.8, 0.39, 0.13], flame: true, nightOnly: false,
  }));
  for (const door of doors) lights.push({ x: (door.row + 0.5) * cellSize, y: 4.1,
    z: (door.col + 0.5) * cellSize, range: 7, colour: [0.6, 0.33, 0.12], flame: true, nightOnly: true });
  return lights;
}

export function nearestSceneLights(sources, feet, { night = false, seconds = 0, carried = false } = {}) {
  const selected = sources.filter((light) => !light.nightOnly || night)
    .map((light) => ({ light, d: Math.hypot(light.x - feet[0], light.z - feet[2]) }))
    .filter(({ light, d }) => d < light.range + 30)
    .sort((a, b) => a.d - b.d).slice(0, SCENE_LIGHT_LIMIT - (carried ? 1 : 0));
  const positions = [], colours = [];
  if (carried) {
    positions.push(feet[0], feet[1] + 1.35, feet[2], 7);
    colours.push(0.38, 0.22, 0.11);
  }
  for (const { light } of selected) {
    const flicker = light.flame ? 0.94 + 0.06 * Math.sin(seconds * 8 + light.x * 1.7 + light.z) : 1;
    positions.push(light.x, light.y, light.z, light.range);
    colours.push(...light.colour.map((v) => v * flicker));
  }
  return { positions: new Float32Array(positions), colours: new Float32Array(colours), count: positions.length / 4 };
}

// Arena-native dressing on the existing depth-tested particle pass, not imported assets.
// Positions are anchored to fixtures/grid cells. A paused frame is pure and camera turns
// cannot drag the air around; only nearby emitters are considered and storage is bounded.
export class SceneAtmosphere {
  constructor() { this.fx = new CombatFx(); }
  geometry(sources, feet, { seconds = 0, night = false, carried = false, enabled = true } = {}, right = [1, 0, 0]) {
    const particles = this.fx.particles;
    particles.length = 0;
    const add = (x, y, z, colour, size, alpha) => {
      if (particles.length >= AMBIENT_PARTICLE_LIMIT) return;
      particles.push({ x, y, z, colour, size, age: 1 - alpha, life: 1 });
    };
    if (enabled) {
      for (const light of sources) {
        if (!light.flame || (light.nightOnly && !night) || Math.hypot(light.x - feet[0], light.z - feet[2]) > 16) continue;
        for (let i = 0; i < 5; i++) {
          const t = (seconds * 0.6 + i / 5 + Math.abs(Math.sin(light.x + light.z))) % 1;
          const angle = i * 2.4 + seconds * 0.8;
          add(light.x + Math.cos(angle) * t * 0.18, light.y + t * 0.8, light.z + Math.sin(angle) * t * 0.18,
            [1, 0.55, 0.14], 0.015 + 0.015 * (1 - t), (1 - t) * 0.6);
        }
        if (particles.length >= 40) break;
      }
      if (carried) {
        const gx = Math.floor(feet[0] / 6) * 6, gz = Math.floor(feet[2] / 6) * 6;
        for (let i = 0; i < 24; i++) {
          const phase = i * 2.399;
          const x = gx - 3 + (i * 1.713 % 12), z = gz - 3 + (i * 2.317 % 12);
          const distance = Math.hypot(x - feet[0], z - feet[2]);
          const glow = Math.max(0, 1 - distance / 7);
          add(x + Math.sin(seconds * 0.19 + phase) * 0.12, feet[1] + 0.25 + (i * 0.173 % 2.1),
            z + Math.cos(seconds * 0.13 + phase) * 0.12, [0.72, 0.62, 0.43], 0.009, glow * 0.24);
        }
      }
    }
    return this.fx.geometry([], right);
  }
}
