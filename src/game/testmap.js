// THE MILESTONE 2 TEST MAP.
//
// A hand-authored courtyard, so the renderer, the player motor, collision, the
// sky and the lighting can be proven to run *before* any Arena bytes are
// parsed. It is not Arena content and it is not meant to look like it — it is
// scaffolding with three flat colours and a wall to bump into.
//
// Geometry convention (engine handedness, `engine/world/mat4.js`'s law): Y is
// up, +Z is forward at yaw 0, screen-right is +X under `mirrorProjectionX`.
// The engine enables CULL_FACE globally, so both windings are emitted here —
// this map is a test harness, and a wrongly-wound wall would read as a missing
// wall. `src/game/mifMesh.js` (Milestone 3) picks the one correct winding and
// is tested by walking the real map.

/** Padding to keep quads off the collision grid's seams. */
const EPS = 0.001;

/** Engine texture-archive namespace for PERFECTARENA's own generated art. */
export const TEST_ARCHIVE = 1;

/** Material ids inside the test map's sub-mesh list. */
export const TEST_MATERIAL = Object.freeze({ FLOOR: 0, WALL: 1, TRIM: 2 });

/**
 * Build one RGBA texture as the renderer's `uploadTexture` expects:
 * bottom-up rows, 4 bytes a pixel.
 * @param {number} size
 * @param {(x:number,y:number)=>[number,number,number,number]} paint
 * @returns {{width:number,height:number,colors:Uint8ClampedArray}}
 */
export function makeTexture(size, paint) {
  const colors = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y);
      const o = (y * size + x) * 4;
      colors[o] = r; colors[o + 1] = g; colors[o + 2] = b; colors[o + 3] = a;
    }
  }
  return { width: size, height: size, colors };
}

/** The three procedural textures the test map draws with. */
export function testTextures() {
  const S = 64;
  const checker = (a, b) => (x, y) => {
    const s = ((x >> 3) + (y >> 3)) & 1;
    const n = ((x * 7 + y * 13) % 11) * 4 - 20;   // a little grain so lighting reads
    const c = s ? a : b;
    return [c[0] + n, c[1] + n, c[2] + n, 255];
  };
  const brick = (mortar, face) => (x, y) => {
    const row = y >> 3;
    const off = (row & 1) ? 8 : 0;
    const isMortar = (y % 8) < 1 || ((x + off) % 16) < 1;
    const c = isMortar ? mortar : face;
    const n = ((x * 5 + y * 3) % 7) * 3 - 9;
    return [c[0] + n, c[1] + n, c[2] + n, 255];
  };
  return [
    { material: TEST_MATERIAL.FLOOR, record: 0, image: makeTexture(S, checker([104, 104, 96], [92, 92, 86])) },
    { material: TEST_MATERIAL.WALL, record: 1, image: makeTexture(S, brick([120, 118, 110], [150, 92, 74])) },
    { material: TEST_MATERIAL.TRIM, record: 2, image: makeTexture(S, checker([70, 70, 76], [58, 58, 64])) },
  ];
}

/**
 * A quad builder that mirrors every face, so no wall can be invisible.
 * @param {{positions:number[], normals:number[], uvs:number[], indices:number[]}} acc
 */
function quad(acc, a, b, c, d, n, uvScale = 1) {
  const base = acc.positions.length / 3;
  const uvs = [[0, 0], [uvScale, 0], [uvScale, uvScale], [0, uvScale]];
  const verts = [a, b, c, d];
  for (let i = 0; i < 4; i++) {
    acc.positions.push(verts[i][0], verts[i][1], verts[i][2]);
    acc.normals.push(n[0], n[1], n[2]);
    acc.uvs.push(uvs[i][0], uvs[i][1]);
  }
  acc.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  acc.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);   // both windings
}

/** Horizontal quad at height `y`, spanning [x0..x1] × [z0..z1] facing `up`. */
function slab(acc, x0, z0, x1, z1, y, up = true) {
  const n = up ? [0, 1, 0] : [0, -1, 0];
  quad(acc, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], n, Math.max(x1 - x0, z1 - z0) / 2);
}

/** Vertical quad from `a` to `b` along the wall's ground line, `h` tall. */
function wall(acc, x0, z0, x1, z1, h, n, uvScale) {
  quad(acc, [x0, 0, z0], [x1, 0, z1], [x1, h, z1], [x0, h, z0], n, uvScale);
}

/**
 * Build the test courtyard.
 *
 * A 48×48 walled court with a gate gap in the north wall, six pillars and a
 * raised dais — enough surface kinds to tell the renderer apart from a
 * clear-colour bug (floor, wall, trim, a shadow-casting pillar, and open sky
 * above).
 *
 * @returns {{model: object, spawn: number[], colliderTris: {positions: Float32Array, indices: Uint32Array}}}
 */
export function buildTestMap() {
  const acc = { positions: [], normals: [], uvs: [], indices: [] };
  const FLOOR = { start: 0, count: 0 };
  const WALL = { start: 0, count: 0 };
  const TRIM = { start: 0, count: 0 };

  const half = 24, wallH = 5;

  // ── floors ────────────────────────────────────────────────────────────────
  slab(acc, -half, -half, half, half, 0, true);

  // ── walls (with a 4-unit gate gap centred on the north edge) ──────────────
  FLOOR.count = acc.indices.length / 3 - FLOOR.start;
  const wallStart = acc.indices.length / 3;
  wall(acc, -half, -half, -half, half, wallH, [1, 0, 0], 6);
  wall(acc, half, half, half, -half, wallH, [-1, 0, 0], 6);
  wall(acc, half, -half, -half, -half, wallH, [0, 0, 1], 6);
  wall(acc, -half, half, -2, half, wallH, [0, 0, -1], 5.5);
  wall(acc, 2, half, half, half, wallH, [0, 0, -1], 5.5);
  // the gate's return walls, so the gap reads as a doorway
  wall(acc, -2, half, -2, half - 1.5, wallH, [1, 0, 0], 0.4);
  wall(acc, 2, half - 1.5, 2, half, wallH, [-1, 0, 0], 0.4);
  WALL.start = wallStart;
  WALL.count = acc.indices.length / 3 - WALL.start;

  // ── pillars + dais (so lighting has something to light) ───────────────────
  const trimStart = acc.indices.length / 3;
  const P = [[-12, -12], [12, -12], [-12, 12], [12, 12], [0, -14], [0, 14]];
  for (const [px, pz] of P) {
    const r = 1.2;
    wall(acc, px - r, pz - r, px + r, pz - r, wallH, [0, 0, 1], 1);
    wall(acc, px + r, pz + r, px - r, pz + r, wallH, [0, 0, -1], 1);
    wall(acc, px - r, pz + r, px - r, pz - r, wallH, [1, 0, 0], 1);
    wall(acc, px + r, pz - r, px + r, pz + r, wallH, [-1, 0, 0], 1);
    slab(acc, px - r, pz - r, px + r, pz + r, wallH, true);
  }
  // a low dais in front of the gate to prove step-up works
  const dy = 0.5, d = 5;
  slab(acc, -d, 6, d, 6 + d, dy, true);
  wall(acc, -d, 6 + d, d, 6 + d, dy, [0, 0, -1], 1);
  wall(acc, d, 6, -d, 6, dy, [0, 0, 1], 1);
  TRIM.start = trimStart;
  TRIM.count = acc.indices.length / 3 - TRIM.start;

  const positions = new Float32Array(acc.positions);
  const indices = new Uint32Array(acc.indices);
  const model = {
    positions,
    normals: new Float32Array(acc.normals),
    uvs: new Float32Array(acc.uvs),
    indices,
    subMeshes: [
      { textureArchive: TEST_ARCHIVE, textureRecord: 0, startIndex: FLOOR.start * 3, primitiveCount: FLOOR.count },
      { textureArchive: TEST_ARCHIVE, textureRecord: 1, startIndex: WALL.start * 3, primitiveCount: WALL.count },
      { textureArchive: TEST_ARCHIVE, textureRecord: 2, startIndex: TRIM.start * 3, primitiveCount: TRIM.count },
    ],
  };
  return { model, spawn: [0, 0.2, -8], colliderTris: { positions, indices } };
}

/** The gate's outward-facing spawn, used by `__debug.teleport` sanity checks. */
export const TEST_MAP_HALF = 24 + EPS;
