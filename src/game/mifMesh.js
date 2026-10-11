// VOXEL LEVEL -> RENDERABLE MESH + COLLIDER.
//
// Turns the model `mifLevel.js` produces into the engine's `MeshBundle`
// (`{positions, normals, uvs, indices, subMeshes}`) — one sub-mesh per Arena
// texture, because a sub-mesh carries a single texture in this renderer — plus
// the triangle soup the engine's capsule collider consumes.
//
// ## World scale
//
// `mifLevel.js` works in *cells*. This module multiplies by `CELL_SIZE` (2.5
// world units, i.e. metres) so that:
//
//   * one grid cell is 2.5 m across and one voxel layer is 2.5 m tall;
//   * the engine's player capsule (1.8 m) and eye (1.7 m) fit comfortably in the
//     one-layer-tall corridor Arena's maps actually are.
//
// OTA instead squashes a layer to `*CEILING height / 128` (≈ 1.05 for a 135-high
// ceiling), which is faithful in the original's own units but leaves a room too
// short for a metre-based capsule. Arena's ceiling height therefore only affects
// appearance here, not geometry — logged as simplification S10 in PROGRESS.md.
//
// ## Winding
//
// The engine calls `gl.frontFace(gl.CW)` while drawing through its mirrored
// projection (`mat4.mirrorProjectionX`), which nets out to **counter-clockwise in
// world space** being the front face. Rather than trust that by hand, every quad
// here goes through `quad()`, which reads the face normal and reverses the corner
// order when the geometric normal disagrees — so the winding cannot be wrong, and
// `tests/unit/mifMesh.test.mjs` asserts it per triangle.

import { cellTexture } from './mifLevel.js';
import { EDGE_FACES } from './mifLevel.js';

/** World units per MIF cell. See the note above. */
export const CELL_SIZE = 2.5;

/** Materials use this archive namespace in the renderer's texture table. */
export const ARENA_TEXTURE_ARCHIVE = 2;

/** Epsilon to keep coplanar quads from fighting. */
const EPS = 1e-4;

/**
 * @typedef {object} MeshMaterial
 * @property {string} key                      `FILENAME#setIndex`
 * @property {number} record                   the renderer record number to upload under
 * @property {import('../arena/infFile.js').InfVoxelTexture} ref
 */

/**
 * @typedef {object} BuiltMesh
 * @property {{positions:Float32Array, normals:Float32Array, uvs:Float32Array, indices:Uint32Array, subMeshes:object[]}} model
 * @property {MeshMaterial[]} materials
 * @property {{positions:Float32Array, indices:Uint32Array}} collider
 * @property {object} stats
 */

/**
 * Build a level's mesh.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level
 * @param {{cellSize?:number, wantCollider?:boolean}} [opts]
 * @returns {BuiltMesh}
 */
export function buildLevelMesh(level, opts = {}) {
  const S = opts.cellSize ?? CELL_SIZE;
  const wantCollider = opts.wantCollider ?? true;
  const inf = level.inf;
  const { width, depth, cells } = level;
  const floorTop = level.floorY;
  const roomTop = level.ceilingY;

  /** @type {Map<string, {ref:object, positions:number[], normals:number[], uvs:number[], indices:number[]}>} */
  const groups = new Map();
  /** @type {number[]} */
  const colliderPositions = [];
  /** @type {number[]} */
  const colliderIndices = [];
  const stats = { quads: 0, floorQuads: 0, ceilingQuads: 0, wallQuads: 0, skippedSides: 0, materials: 0, colliderTris: 0 };

  const at = (row, col) => (row < 0 || col < 0 || row >= depth || col >= width ? null : cells[row * width + col]);

  /** A material bucket for one INF texture reference, creating it on demand. */
  const group = (ref) => {
    if (!ref || !ref.filename) return null;
    const key = `${ref.filename}#${ref.setIndex}`;
    let g = groups.get(key);
    if (!g) {
      g = { ref, positions: [], normals: [], uvs: [], indices: [] };
      groups.set(key, g);
    }
    return g;
  };

  /**
   * Push one quad. `corners` is any consistent loop around the face; the order is
   * corrected against `normal` so the winding is always right.
   *
   * @param {{positions:number[],normals:number[],uvs:number[],indices:number[]}} g
   * @param {number[][]} corners  four [x,y,z] in world units
   * @param {number[]} normal
   * @param {number[][]} uv       four [u,v]
   * @param {boolean} collide     also register in the collision soup
   */
  const quad = (g, corners, normal, uv, collide) => {
    if (!g) return;
    let c = corners;
    const e1 = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]];
    const e2 = [c[2][0] - c[0][0], c[2][1] - c[0][1], c[2][2] - c[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * normal[0] + cy * normal[1] + cz * normal[2] < 0) c = [c[0], c[3], c[2], c[1]];

    const base = g.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      g.positions.push(c[i][0], c[i][1], c[i][2]);
      g.normals.push(normal[0], normal[1], normal[2]);
      g.uvs.push(uv[i][0], uv[i][1]);
    }
    g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    stats.quads++;

    if (collide && wantCollider) {
      const cb = colliderPositions.length / 3;
      for (let i = 0; i < 4; i++) colliderPositions.push(c[i][0], c[i][1], c[i][2]);
      colliderIndices.push(cb, cb + 1, cb + 2, cb, cb + 2, cb + 3);
      stats.colliderTris += 2;
    }
  };

  const unitUv = [[0, 0], [1, 0], [1, 1], [0, 1]];

  /** Is this cell's structure a solid box filling the whole cell floor-to-ceiling? */
  const fullBox = (cell) => Boolean(cell) && cell.solid
    && (cell.kind === 'wall' || cell.kind === 'door' || cell.kind === 'transparent' || cell.kind === 'diagonal')
    && cell.yOffset <= EPS;

  /** Vertical span of a structure in cells: `[bottom, top]`, or null when there is none. */
  const spanOf = (cell) => {
    if (!cell || cell.kind === 'air' || cell.kind === 'entity') return null;
    if (cell.kind === 'raised') return [floorTop + cell.yOffset, floorTop + cell.yOffset + Math.max(cell.ySize, 0.05)];
    if (cell.kind === 'edge') {
      const top = cell.ySize > 0 ? floorTop + cell.yOffset + cell.ySize : roomTop;
      return [floorTop + cell.yOffset, top];
    }
    return [floorTop, roomTop];                     // wall, door, transparent, diagonal
  };

  // ── floors and ceilings ────────────────────────────────────────────────────
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const cell = cells[row * width + col];
      const x0 = row * S, x1 = (row + 1) * S;
      const z0 = col * S, z1 = (col + 1) * S;

      // The floor is hidden only when a solid box stands on it.
      const coveredByFullBox = fullBox(cell);
      if (!coveredByFullBox) {
        const g = group(cellTexture(cell, 'floor', inf));
        const y = floorTop * S;
        quad(g, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], unitUv, true);
        stats.floorQuads++;
      }

      if (cell.ceiling) {
        const g = group(cellTexture(cell, 'ceiling', inf));
        const y = (roomTop - EPS) * S;
        quad(g, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, -1, 0], unitUv, true);
        stats.ceilingQuads++;
      }
    }
  }

  // ── structures ─────────────────────────────────────────────────────────────
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const cell = cells[row * width + col];
      const span = spanOf(cell);
      if (!span) continue;
      const [bottomCell, topCell] = span;
      const bottom = bottomCell * S, top = topCell * S;
      const x0 = row * S, x1 = (row + 1) * S;
      const z0 = col * S, z1 = (col + 1) * S;

      if (cell.kind === 'edge') {
        const face = EDGE_FACES[cell.facing] ?? EDGE_FACES[0];
        const n = face.normal;
        // The quad sits on the named face of the cell.
        const corners = face.tangent === 'z'
          ? [[(n[0] < 0 ? x0 : x1), bottom, z0], [(n[0] < 0 ? x0 : x1), bottom, z1],
             [(n[0] < 0 ? x0 : x1), top, z1], [(n[0] < 0 ? x0 : x1), top, z0]]
          : [[x0, bottom, (n[2] < 0 ? z0 : z1)], [x1, bottom, (n[2] < 0 ? z0 : z1)],
             [x1, top, (n[2] < 0 ? z0 : z1)], [x0, top, (n[2] < 0 ? z0 : z1)]];
        const heightTiles = (topCell - bottomCell);
        quad(group(cellTexture(cell, 'side', inf)), corners, n,
          [[0, 0], [1, 0], [1, heightTiles], [0, heightTiles]], cell.solid);
        continue;
      }

      if (cell.kind === 'diagonal') {
        // A thin wall across the cell's diagonal. Both sides are emitted so the
        // slab is opaque from either direction without relying on culling.
        const right = cell.facing === 0;
        const t = 0.06 * S;
        const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
        const dir = right ? [1, 0, -1] : [1, 0, 1];
        const len = Math.hypot(dir[0], dir[2]);
        const ux = dir[0] / len, uz = dir[2] / len;
        const half = (Math.SQRT2 / 2) * S;
        const a = [cxm - ux * half, czm - uz * half];
        const b = [cxm + ux * half, czm + uz * half];
        const nx = -uz, nz = ux;
        const off = [nx * t / 2, nz * t / 2];
        const g = group(cellTexture(cell, 'side', inf));
        quad(g, [[a[0] + off[0], bottom, a[1] + off[1]], [b[0] + off[0], bottom, b[1] + off[1]],
          [b[0] + off[0], top, b[1] + off[1]], [a[0] + off[0], top, a[1] + off[1]]],
        [nx, 0, nz], [[0, 0], [1, 0], [1, 1], [0, 1]], true);
        quad(g, [[a[0] - off[0], bottom, a[1] - off[1]], [b[0] - off[0], bottom, b[1] - off[1]],
          [b[0] - off[0], top, b[1] - off[1]], [a[0] - off[0], top, a[1] - off[1]]],
        [-nx, 0, -nz], [[0, 0], [1, 0], [1, 1], [0, 1]], true);
        continue;
      }

      const sideRef = cellTexture(cell, 'side', inf);
      const tiles = Math.max(topCell - bottomCell, 0.05);
      // A face is skipped when the neighbour already draws the same surface: both
      // cells full boxes, or both raised platforms of equal span.
      const hideAgainst = (n) => {
        if (!n) return false;
        if (fullBox(cell) && fullBox(n)) return true;
        if (cell.kind === 'raised' && n.kind === 'raised') {
          return Math.abs(n.yOffset - cell.yOffset) < EPS && Math.abs(n.ySize - cell.ySize) < EPS;
        }
        return false;
      };

      // Four sides. Neighbour axis: row is world X, col is world Z.
      const sides = [
        { n: [-1, 0, 0], nb: at(row - 1, col), corners: [[x0, bottom, z0], [x0, bottom, z1], [x0, top, z1], [x0, top, z0]] },
        { n: [1, 0, 0], nb: at(row + 1, col), corners: [[x1, bottom, z0], [x1, bottom, z1], [x1, top, z1], [x1, top, z0]] },
        { n: [0, 0, -1], nb: at(row, col - 1), corners: [[x0, bottom, z0], [x1, bottom, z0], [x1, top, z0], [x0, top, z0]] },
        { n: [0, 0, 1], nb: at(row, col + 1), corners: [[x0, bottom, z1], [x1, bottom, z1], [x1, top, z1], [x0, top, z1]] },
      ];
      for (const s of sides) {
        if (hideAgainst(s.nb)) { stats.skippedSides++; continue; }
        quad(group(sideRef), s.corners, s.n, [[0, 0], [1, 0], [1, tiles], [0, tiles]], cell.solid);
        stats.wallQuads++;
      }

      // Top and bottom faces.
      const capRef = cellTexture(cell, 'cap', inf) ?? sideRef;
      const bottomRef = cellTexture(cell, 'bottom', inf) ?? sideRef;
      if (cell.kind === 'raised') {
        // The top is visible unless something seals it; the underside is only
        // visible when the platform floats.
        quad(group(capRef), [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]], [0, 1, 0], unitUv, true);
        if (cell.yOffset > EPS) {
          quad(group(bottomRef), [[x0, bottom, z0], [x0, bottom, z1], [x1, bottom, z1], [x1, bottom, z0]], [0, -1, 0], unitUv, true);
        }
      } else if (cell.kind === 'transparent') {
        // Arches are open-topped one-sided panels; nothing else to emit.
      } else if (!cell.ceiling) {
        // A full box under open sky needs a lid, or the player sees through it.
        quad(group(capRef), [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]], [0, 1, 0], unitUv, true);
      }
    }
  }

  // ── pack ───────────────────────────────────────────────────────────────────
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const subMeshes = [];
  /** @type {MeshMaterial[]} */
  const materials = [];
  let vertexBase = 0;

  for (const [key, g] of groups) {
    if (!g.indices.length) continue;
    const startIndex = indices.length;
    for (let i = 0; i < g.positions.length; i++) positions.push(g.positions[i]);
    for (let i = 0; i < g.normals.length; i++) normals.push(g.normals[i]);
    for (let i = 0; i < g.uvs.length; i++) uvs.push(g.uvs[i]);
    for (let i = 0; i < g.indices.length; i++) indices.push(g.indices[i] + vertexBase);
    vertexBase += g.positions.length / 3;
    const record = materials.length;
    materials.push({ key, record, ref: g.ref });
    subMeshes.push({
      textureArchive: ARENA_TEXTURE_ARCHIVE,
      textureRecord: record,
      startIndex,
      primitiveCount: g.indices.length / 3,
      key,
    });
  }
  stats.materials = materials.length;

  return {
    model: {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      subMeshes,
    },
    materials,
    collider: {
      positions: new Float32Array(colliderPositions),
      indices: new Uint32Array(colliderIndices),
    },
    stats,
  };
}
