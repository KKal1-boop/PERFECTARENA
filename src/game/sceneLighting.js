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
// **A lamp is a light, not just a picture.** `NLAMP1.DFA` / `NLAMP1DA.IMG` are the city street
// lamps and `TORCHPST.DFA` is the post torch; the old pattern named every flame EXCEPT the lamp,
// so a town at night had windows and torches but its lamps were dead sprites. The owner's report
// (2026-10-19): *"the sprites of the lamps in cities all need to emanate light at night"*.
const FIRE_ART = /(TORCH|BRAZ|FIRE|CANDLE|LANTERN|LAMP|CHAOS)/;
/**
 * The lamps of a street, as opposed to a dungeon's fire.
 *
 * A town's lanterns are lit **at night** — that is what a lamp is for — while a torch, a brazier or
 * a candle in a dungeon burns whenever it burns. The distinction is only asked of a level that is
 * outside (`opts.outdoor`), so a dungeon's own `LANTERN` flat keeps burning at noon exactly as it
 * always did.
 */
const LAMP_ART = /(LANTERN|LAMP)/;

/**
 * A level's own light sources: its fire art, and (when a caller says which levels are streets) its
 * lamps as **night lights**.
 *
 * **A doorway is not a lamp.** This used to add a flickering `nightOnly` light at *every* door of a
 * level, which is what the owner saw: *"at night in cities the lamps and the windows of the houses
 * should have a light not the front of the inns like it is right now"*. A door is a hole in a wall,
 * and a light in it lit the inn's own step and nothing else — where the game lights a *building*, its
 * windows glowing onto the street, and its street lamps. The windows are their own pass
 * (`buildingWindowLights`, which needs the level's cells to know which way a door faces).
 *
 * @param {{name: string, row: number, col: number, baseY?: number}[]} [flats]
 * @param {object[]} [doors]  kept in the signature for callers that still pass the level's doors
 * @param {number} [cellSize]
 * @param {{outdoor?: boolean}} [opts]  `outdoor`: this level is a street, so its lamps wait for dark
 * @returns {object[]}
 */
export function sceneLightSources(flats = [], doors = [], cellSize = 2.5, opts = {}) {
  void doors;
  const outdoor = Boolean(opts.outdoor);
  return flats.filter((flat) => FIRE_ART.test(String(flat.name).toUpperCase())).map((flat) => {
    const name = String(flat.name).toUpperCase();
    return {
      x: (flat.row + 0.5) * cellSize, y: flat.baseY ?? 3.6, z: (flat.col + 0.5) * cellSize,
      range: 8, colour: [0.8, 0.39, 0.13], flame: true,
      // A street lamp is lit by dark; a dungeon's torch is not.
      nightOnly: outdoor && LAMP_ART.test(name),
      lamp: outdoor && LAMP_ART.test(name),
    };
  });
}

/**
 * The **windows of a town**: two warm lights just inside each building's street wall.
 *
 * The owner, 2026-10-17: *"at night in cities the lamps and the windows of the houses should have a
 * light not the front of the inns like it is right now"*.
 *
 * A building's front is read from the map rather than guessed: every building in an Arena city block
 * has exactly one door, and **the mass behind that door is the building**. So the light goes *inside*
 * the mass, a body-height and a half above the floor, in two spots either side of the door along the
 * wall — which is where a house's windows are — and it is `nightOnly`, so the same street is dark by
 * day. Light here is a point light with no shadowing, so this is what makes a wall face glow where
 * the art draws windows; nothing is drawn and nothing is collidable.
 *
 * The `doors` are the level's own door leaves (`interior.js`'s `leafSpots`), so a street with no
 * doors — a dungeon corridor, the country — gets no window lights at all.
 *
 * @param {object} level  a decoded level (`game/mifLevel.js`)
 * @param {{row: number, col: number}[]} [doors]
 * @param {{cellSize?: number, height?: number, reach?: number}} [opts]
 * @returns {object[]}
 */
export function buildingWindowLights(level, doors = [], opts = {}) {
  const S = opts.cellSize ?? 2.5;
  const reach = opts.reach ?? 1.35;
  if (!level?.cells || !level.width || !level.depth) return [];
  // A window is a body and a half up a wall — **but a low room gets low windows**: a ceiling one
  // cell over the floor is 2.5 m of room, and a pane at 2.6 m would be in the storeys. The height
  // is the smaller of the two, so the pass is correct for a city's rooms and for a flat one.
  const room = ((level.ceilingY ?? level.floorY + 1) - level.floorY) * S;
  const height = Math.min(opts.height ?? 2.6, Math.max(1.2, room * 0.62));
  const at = (row, col) => (row < 0 || col < 0 || row >= level.depth || col >= level.width
    ? null : level.cells[row * level.width + col]);
  const y = level.floorY * S + height;
  const lights = [];
  for (const door of doors) {
    // Which way is *into* the building: a solid neighbour, and the building's own mass above the
    // ground floor when the level has storeys (a city does; a dungeon's ceilings do not).
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const solid = (dr, dc) => { const q = at(door.row + dr, door.col + dc); return q && q.solid ? q : null; };
    let inside = null;
    for (const [dr, dc] of sides) { const q = solid(dr, dc); if (q && (q.upperLayers ?? 0) > 0) { inside = [dr, dc]; break; } }
    if (!inside) for (const [dr, dc] of sides) if (solid(dr, dc)) { inside = [dr, dc]; break; }
    if (!inside) continue;
    const [dr, dc] = inside;
    const cx = (door.row + 0.5) * S + dr * reach;
    const cz = (door.col + 0.5) * S + dc * reach;
    // Along the wall the door stands in: the two panes either side of it.
    const along = dr !== 0 ? [0, 1] : [1, 0];
    for (const side of [-1, 1]) {
      lights.push({
        x: cx + along[0] * side * 0.85, y, z: cz + along[1] * side * 0.85,
        range: 4.4, colour: [0.95, 0.68, 0.30], flame: false, nightOnly: true, window: true,
      });
    }
  }
  return lights;
}

export function nearestSceneLights(sources, feet, { night = false, seconds = 0, carried = false, spellLight = null } = {}) {
  const extra = (carried ? 1 : 0) + (spellLight ? 1 : 0);
  const selected = sources.filter((light) => !light.nightOnly || night)
    .map((light) => ({ light, d: Math.hypot(light.x - feet[0], light.z - feet[2]) }))
    .filter(({ light, d }) => d < light.range + 30)
    .sort((a, b) => a.d - b.d).slice(0, Math.max(0, SCENE_LIGHT_LIMIT - extra));
  const positions = [], colours = [];
  if (carried) {
    positions.push(feet[0], feet[1] + 1.35, feet[2], 7);
    colours.push(0.38, 0.22, 0.11);
  }
  // **The spell's own light rides the player.** A point light at chest height, warm-white,
  // with the spell's radius as its reach — the half of "Light" the ambient boost could not
  // give: it lights the floor, the walls and the people around the caster as they walk.
  if (spellLight) {
    positions.push(feet[0], feet[1] + 1.5, feet[2], Number(spellLight.range) || 8);
    const c = spellLight.colour ?? [1, 0.84, 0.56];
    colours.push(c[0], c[1], c[2]);
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
