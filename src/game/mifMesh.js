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
 * How far below the floor a chasm's bed lies, in world units.
 *
 * Shallow on purpose: the engine's motor steps over 0.5 m (`STEP_OFFSET`), so a player
 * who wades into a pool always walks back out. See the chasm pass in `buildLevelMesh`.
 */
export const CHASM_DEPTH = 0.45;

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
 * @property {{id:string, row:number, col:number, kind:string, panel:'x'|'z', model:object, collider:{positions:Float32Array, indices:Uint32Array}, texture:string|null}[]} doors
 *   one bundle per `0xB` door, which the scene draws with its own transform and whose
 *   collider slice it drops when the door opens
 * @property {object} stats
 */

/**
 * Build a level's mesh.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level
 * @param {{cellSize?:number, wantCollider?:boolean, upperStoreys?:boolean}} [opts]
 *   `upperStoreys` draws the **mass MAP2 holds above the playable layer** — the upper
 *   floors and the roof of every city building. It is off by default because it is only
 *   visible where there is open sky to see it against (a dungeon's MAP2 is a ceiling, and
 *   drawing the stone above a ceiling is geometry nobody can look at).
 * @returns {BuiltMesh}
 */
export function buildLevelMesh(level, opts = {}) {
  const S = opts.cellSize ?? CELL_SIZE;
  const wantCollider = opts.wantCollider ?? true;
  const upperStoreys = opts.upperStoreys ?? false;
  const inf = level.inf;
  const { width, depth, cells } = level;
  const floorTop = level.floorY;
  const roomTop = level.ceilingY;

  /** @type {Map<string, {ref:object, positions:number[], normals:number[], uvs:number[], indices:number[]}>} */
  const groups = new Map();
  /** @type {number[]} */
  let colliderPositions = [];
  /** @type {number[]} */
  let colliderIndices = [];
  const stats = {
    quads: 0, floorQuads: 0, ceilingQuads: 0, wallQuads: 0, skippedSides: 0, materials: 0,
    colliderTris: 0, chasmBeds: 0, chasmWalls: 0, colliderOnlyQuads: 0, drawnNotSolid: 0,
    doors: 0, upperBoxes: 0, roofQuads: 0, upperLayers: 0,
  };

  const at = (row, col) => (row < 0 || col < 0 || row >= depth || col >= width ? null : cells[row * width + col]);

  /**
   * A material bucket for one INF texture reference, creating it on demand.
   *
   * **`cutout` is part of the bucket.** Arena's sign, banner, laundry, gate and hedge
   * art is a picture in the middle of a 64×64 tile with palette index 0 all around it
   * (`TLAUNDRY.IMG` is 92% index 0, `T_TTEP.IMG` 75%, `PGATE.IMG` 22%), and those
   * pictures are placed on the `0xA` **edge** and `0x9` **transparent** voxels — the
   * two kinds the original also draws as see-through panels. Drawn opaque they are
   * black rectangles standing in the street: the sign, the washing line and the
   * palace gate all came back as black slabs. The very same art on a *wall* (every
   * `TBS*.SET` building tile) is opaque, index 0 included, so the treatment travels
   * with the bucket and not with the file.
   */
  const groupIn = (map, ref, cutout = false) => {
    if (!ref || !ref.filename) return null;
    // The bucket key carries the treatment, so the same art used opaque on a wall and
    // cut out on a door is uploaded (and drawn) twice rather than one winning.
    const key = `${ref.filename}#${ref.setIndex}${cutout ? '#cut' : ''}`;
    let g = map.get(key);
    if (!g) {
      g = { ref, cutout, positions: [], normals: [], uvs: [], indices: [] };
      map.set(key, g);
    }
    return g;
  };
  const group = (ref, cutout = false) => groupIn(groups, ref, cutout);

  // ── doors are their own bundles ────────────────────────────────────────────
  //
  // A `0xB` door is a **door**, not a wall: it opens, so its geometry cannot live in
  // the level's one static mesh. Each door gets its own small `MeshBundle` and its own
  // slice of the collider, and the scene draws it with a transform that swings, slides
  // or lifts it and drops its collider slice when it opens (`scenes/interior.js`'s
  // door system). A door that is closed is exactly the block it always was: the same
  // four sides in the same place, so nothing about a shut door's picture changes.
  //
  // The bundle is built around the cell's own **hinge edge**, which is why the geometry
  // is emitted in world coordinates and the scene rotates it about a pivot of its own:
  // `hingeFor` in the scene takes the pivot from the cell's `doorKind`, and the whole
  // quads' vertex positions are relative to it, so a rotation about the pivot is a
  // rotation of the door in place.
  /** @type {Map<number, object>} */
  const doorIndex = new Map();
  /** @type {object[]} */
  const doorRecords = [];
  const doorFor = (row, col, cell) => {      const key = row * width + col;
    let door = doorIndex.get(key);
    if (!door) {
      door = {
        id: `door:${row},${col}`,
        row, col,
        kind: cell.doorKind ?? 'swinging',
        groups: new Map(),
        collider: { positions: [], indices: [] },
        quads: 0,
        // Which way the panel lies: `x` means it spans the cell's x-axis (its plane
        // is z = the cell's middle), `z` the other way. The scene's hinge picks
        // itself from this (`game/doors.js`).
        panel: 'x',
      };
      doorIndex.set(key, door);
      doorRecords.push(door);
    }
    return door;
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
   * @param {{positions:number[],indices:number[]}|null} [sink]  a door's own soup
   */
  const quad = (g, corners, normal, uv, collide, sink = null) => {
    if (!g) return;
    let c = corners;
    let t = uv;
    const e1 = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]];
    const e2 = [c[2][0] - c[0][0], c[2][1] - c[0][1], c[2][2] - c[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * normal[0] + cy * normal[1] + cz * normal[2] < 0) {
      // **THE UVs RIDE ALONG.** Two of the four side quads below wind the "wrong" way
      // for their outward normal and are reversed here; reversing only the corners left
      // the texture pinned to the corner *index*, so the east and south faces of every
      // block drew their art mirrored and rotated a quarter turn - the "textures are
      // flipped" report, and it was exactly half of the walls in the game.
      c = [c[0], c[3], c[2], c[1]];
      t = [uv[0], uv[3], uv[2], uv[1]];
    }

    // A vertical texture must read left-to-right when viewed from its FRONT.
    // Winding repair alone cannot guarantee that: opposite ±X/±Z faces used the
    // same U direction, mirroring half the dungeon walls (and back faces of doors).
    if (Math.abs(normal[1]) < EPS) {
      const rightX = -normal[2], rightZ = normal[0];
      const meanU = t.reduce((sum, p) => sum + p[0], 0) / 4;
      let handedness = 0;
      for (let i = 0; i < 4; i++) handedness += (c[i][0] * rightX + c[i][2] * rightZ) * (t[i][0] - meanU);
      if (handedness < 0) {
        const us = t.map(p => p[0]), sum = Math.min(...us) + Math.max(...us);
        t = t.map(([u, v]) => [sum - u, v]);
      }
    }

    const base = g.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      g.positions.push(c[i][0], c[i][1], c[i][2]);
      g.normals.push(normal[0], normal[1], normal[2]);
      g.uvs.push(t[i][0], t[i][1]);
    }
    g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    stats.quads++;

    if (collide && wantCollider) {
      // A door's triangles go into the door's own soup (`sink`), so opening it takes
      // exactly them out of the world (`Collider.removeBucket`).
      const positions = sink ? sink.positions : colliderPositions;
      const indices = sink ? sink.indices : colliderIndices;
      const cb = positions.length / 3;
      for (let i = 0; i < 4; i++) positions.push(c[i][0], c[i][1], c[i][2]);
      indices.push(cb, cb + 1, cb + 2, cb, cb + 2, cb + 3);
      stats.colliderTris += 2;
    } else {
      stats.drawnNotSolid++;
    }
  };

  /**
   * Push one quad into the **collision soup only**, with nothing drawn.
   *
   * Used where the level needs something to stand on that must not be seen: the floor
   * inside a solid box, which the drawn mesh leaves out because the box already covers it.
   * The first version left it out of the collider too, and a player who ended up inside a
   * wall cell (a teleport, a level's own start point, a monster's shove) fell straight
   * through the world and never came back — the "you can drop outside the map" report.
   *
   * @param {number[][]} corners  four [x,y,z] in world units
   */
  const collideQuad = (corners) => {
    if (!wantCollider) return;
    const cb = colliderPositions.length / 3;
    for (let i = 0; i < 4; i++) colliderPositions.push(corners[i][0], corners[i][1], corners[i][2]);
    colliderIndices.push(cb, cb + 1, cb + 2, cb, cb + 2, cb + 3);
    stats.colliderTris += 2;
    stats.colliderOnlyQuads++;
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

      // The floor is hidden when a solid box stands on it, and a chasm cell has no floor
      // at the surface at all: what it has is a bed, below (`chasmFloor`, further down).
      //
      // **A door is the exception.** A door stands *in* a doorway, and the floor under it
      // is the threshold a player walks over: hiding it made the cell a hole in the floor
      // the moment the door swung open. The box still owns its own sides; the floor is drawn.
      const coveredByFullBox = fullBox(cell) && cell.kind !== 'door';
      if (!coveredByFullBox && !cell.floor.chasm) {
        const g = group(cellTexture(cell, 'floor', inf));
        const y = floorTop * S;
        quad(g, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], unitUv, true);
        stats.floorQuads++;
      } else if (coveredByFullBox && !cell.floor.chasm) {
        // No cell of a level may be bottomless. The floor under a solid box is invisible —
        // the box hides it — but it has to be *there* in the collider, or anything that
        // stands inside the box falls out of the level for good.
        const y = floorTop * S;
        collideQuad([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]]);
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
      const [bottomCell, topCell] = span;        const bottom = bottomCell * S;
        // An edge panel is exactly one cell tall (`tiles` below); everything else runs
        // to its span.
        const top = cell.kind === 'edge' ? bottom + S : topCell * S;
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
        // One panel, one tile. An edge is a *sign* — a shop's board, a tavern's, a
        // washing line, a gate grill — and the original draws it a single cell tall at
        // the voxel's own offset. The first version stretched the tile from that offset
        // to the ceiling (`topCell - bottomCell`, 0.8…1.8 tiles), so every sign was
        // squashed vertically by however high it hung.
        const tiles = 1;
        quad(group(cellTexture(cell, 'side', inf), true), corners, n,
          [[0, 0], [1, 0], [1, tiles], [0, tiles]], cell.solid);
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
      // The door this cell is, if it is one: its quads are filed in the door's own
      // bundle and its triangles in the door's own collider slice.
      const door = cell.kind === 'door' ? doorFor(row, col, cell) : null;
      const sink = door ? door.collider : null;
      // A `0x9` transparent wall is Arena's other see-through panel: hedges, garden
      // walls, the banners on a shopfront. Its art is cut out (`T_GARDEN.IMG` is 41%
      // index 0, `T_NHEDGE.IMG` 2%), and drawn opaque it is a slab of black.
      //
      // **Doors are the same kind of art and were the reported "you cant see trough the
      // doors in dungeons".** A `0xB` door's texture is chosen by the map for what the
      // door *is*: the Imperial Dungeons' cell doors are `SCELL.IMG`, whose own pixels
      // are **45.5% index 0** — the bars and the gap around them — and drawn opaque the
      // whole doorway is a black slab that hides the corridor behind it. Measured
      // across the shipped dungeons, every door art with a meaningful index-0 share is
      // a barred or grated one (`SCELL.IMG` 45.5%, `T_PRISON.IMG`, `T_BARS.IMG`), while
      // a solid door (`DCAS4.IMG` 0.2%) loses nothing to the cutout. So the treatment is
      // the door's, not the texture's, exactly as it is the transparent wall's.
      //
      // **A door is a thin panel, not a box.** The block it stands in is a doorway, and
      // the panel that fills it is one cell wide and one cell tall and *as thick as a
      // door* — the two faces of the cell, which is what the first version emitted, are
      // 2.5 m apart and cannot swing about their own edge without turning into a slab.
      // So a door emits two back-to-back quads on the cell's **middle plane**, with a
      // normal each way: face-on it is the door the map drew, and about its own edge it
      // swings like one (`game/doors.js`). The panel lies across the corridor, which is
      // why it is emitted across the axis the cell's own open neighbours run along.
      if (door) {
        const openX = !fullBox(at(row - 1, col)) && !fullBox(at(row + 1, col));
        const openZ = !fullBox(at(row, col - 1)) && !fullBox(at(row, col + 1));
        // Walking along z (both z neighbours open, the x ones not) means the panel
        // blocks z: it spans x, on the plane z = the cell's middle.
        const spansX = openZ && !openX;
        const across = spansX ? (z0 + z1) / 2 : (x0 + x1) / 2;
        const corners = spansX
          ? [[x0, bottom, across], [x1, bottom, across], [x1, top, across], [x0, top, across]]
          : [[across, bottom, z1], [across, bottom, z0], [across, top, z0], [across, top, z1]];
        door.panel = spansX ? 'x' : 'z';
        const panel = groupIn(door.groups, sideRef, true);
        quad(panel, corners, spansX ? [0, 0, -1] : [-1, 0, 0], unitUv, true, sink);
        quad(panel, corners, spansX ? [0, 0, 1] : [1, 0, 0], unitUv, true, sink);
        door.quads += 2;
        stats.wallQuads += 2;
        continue;
      }

      const cutout = cell.kind === 'transparent';
      const tiles = Math.max(topCell - bottomCell, 0.05);
      // A face is skipped when the neighbour already draws the same surface: both
      // cells full boxes, or both raised platforms of equal span.
      const hideAgainst = (n) => {
        if (!n) return false;
        // A door hides nothing: its own cell is a doorway, and the faces around it are
        // the jambs the player looks at once the door swings (`hideAgainst` is asked of
        // the *neighbour's* box, which is not a door in that direction).
        if (fullBox(cell) && fullBox(n) && n.kind !== 'door') return true;
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
        quad(group(sideRef, cutout), s.corners, s.n, [[0, 0], [1, 0], [1, tiles], [0, tiles]], cell.solid);
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
        quad(group(capRef, cutout), [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]], [0, 1, 0], unitUv, true);
      }
    }
  }

  // ── the storeys above (city blocks: upper floors and roofs) ───────────────
  //
  // MAP2 is the mass over the playable layer, and in a city that mass **is the
  // building**: everything above the ground floor. `mifLevel.js` reads its height class
  // into `cell.upperLayers` (1…3 layers, measured across the install's 368 block `.MIF`s:
  // 356 of them hold more than one), and this draws it — four sides and a roof, three
  // storeys of wall art repeated once per layer so a two-storey facade reads as two
  // storeys, and the top face of the tallest layer as the roof.
  //
  // Why the *level* needed this: the port drew one box per structure, `floorTop` to
  // `roomTop` — one storey, everywhere, for every map. A block that put three layers of
  // mass above its shopfront therefore came out as a shopfront with a lid on it, and the
  // roofs and upper floors the original draws in every Arena city were simply absent
  // ("dont cheapfix but do fast progress. multiple floors buildings in cities are missing").
  //
  // Nothing here is collided. The mass begins at `roomTop`, which is a full storey above
  // the floor the player walks on, so the player can never reach it; putting 40 000
  // triangles of roof into the collision soup would cost the collider real work for no
  // possible contact. The ceiling quad the structures pass already emitted closes the
  // underside, so a street between two tall buildings still has a surface overhead.
  if (upperStoreys) {
    for (let row = 0; row < depth; row++) {
      for (let col = 0; col < width; col++) {
        const cell = cells[row * width + col];
        const layers = cell.upperLayers ?? 0;
        // A raised box in MAP2 (`0x0tttthhh`) is not a storey: its low byte is a *BOX
        // slot, not a texture, and its high byte is a height/thickness pair. City blocks
        // hold none (measured: every non-zero MAP2 voxel in the install's blocks is a
        // plain wall), so a vault that used one is reported rather than drawn wrong.
        if (!layers || cell.upperRaised) continue;
        const ref = cellTexture(cell, 'ceiling', inf);
        if (!ref) continue;
        const g = group(ref);
        const bottom = roomTop * S;
        const top = (roomTop + layers) * S;
        const x0 = row * S, x1 = (row + 1) * S;
        const z0 = col * S, z1 = (col + 1) * S;
        // One tile of the block's own art per layer, so the storeys are countable.
        const uv = [[0, 0], [1, 0], [1, layers], [0, layers]];
        quad(g, [[x0, bottom, z0], [x0, bottom, z1], [x0, top, z1], [x0, top, z0]], [-1, 0, 0], uv, false);
        quad(g, [[x1, bottom, z0], [x1, bottom, z1], [x1, top, z1], [x1, top, z0]], [1, 0, 0], uv, false);
        quad(g, [[x0, bottom, z0], [x1, bottom, z0], [x1, top, z0], [x0, top, z0]], [0, 0, -1], uv, false);
        quad(g, [[x0, bottom, z1], [x1, bottom, z1], [x1, top, z1], [x0, top, z1]], [0, 0, 1], uv, false);
        // The roof: the top face of the tallest layer this cell holds. A cell whose
        // neighbour is taller keeps its own roof, and the neighbour's wall stands beside
        // it — which is what a city's stepped skyline is made of.
        quad(g, [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]], [0, 1, 0], unitUv, false);
        stats.upperBoxes++;
        stats.upperLayers += layers;
        stats.roofQuads++;
      }
    }
  }

  // ── a chasm is a pool, not a floor ─────────────────────────────────────────
  //
  // The original draws a chasm as a bed *below* the surface with a wall around it —
  // `ArenaChasmUtils` says a wet or lava chasm may be swum in and a lava one hurts, and
  // `VoxelChasmDefinition::initClassic` gives it a height of its own (the INF ceiling's
  // default, 100 Arena units ≈ 0.78 cell) rather than the level's. This build sinks the
  // bed by `CHASM_DEPTH`, which is deliberately **shallower than the motor's own step
  // offset** (`STEP_OFFSET` 0.5 m): the player wades in and steps back out, so the pool
  // can never trap them. Swimming, drowning and the pit's fall damage are the next step
  // (S12).
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const cell = cells[row * width + col];
      if (!cell.floor.chasm) continue;
      const x0 = row * S, x1 = (row + 1) * S;
      const z0 = col * S, z1 = (col + 1) * S;
      const surface = floorTop * S;
      const bed = surface - CHASM_DEPTH;
      const g = group(cellTexture(cell, 'floor', inf));
      quad(g, [[x0, bed, z0], [x0, bed, z1], [x1, bed, z1], [x1, bed, z0]], [0, 1, 0], unitUv, true);
      stats.chasmBeds++;

      // The rim, where another chasm does not continue: both sides are emitted, so the
      // shallow bank is not a hole when it is seen from the water rather than from land.
      const rims = [
        { n: [-1, 0, 0], nb: at(row - 1, col), corners: [[x0, bed, z0], [x0, bed, z1], [x0, surface, z1], [x0, surface, z0]] },
        { n: [1, 0, 0], nb: at(row + 1, col), corners: [[x1, bed, z0], [x1, bed, z1], [x1, surface, z1], [x1, surface, z0]] },
        { n: [0, 0, -1], nb: at(row, col - 1), corners: [[x0, bed, z0], [x1, bed, z0], [x1, surface, z0], [x0, surface, z0]] },
        { n: [0, 0, 1], nb: at(row, col + 1), corners: [[x0, bed, z1], [x1, bed, z1], [x1, surface, z1], [x0, surface, z1]] },
      ];
      for (const rim of rims) {
        if (rim.nb && rim.nb.floor.chasm) continue;   // the pool continues; no bank here
        if (fullBox(rim.nb)) continue;                // a structure already draws this face
        quad(g, rim.corners, [-rim.n[0], -rim.n[1], -rim.n[2]], unitUv, true);
        quad(g, rim.corners, rim.n, unitUv, true);
        stats.chasmWalls += 2;
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
    // (door sub-meshes are packed below, from their own group sets)
    for (let i = 0; i < g.positions.length; i++) positions.push(g.positions[i]);
    for (let i = 0; i < g.normals.length; i++) normals.push(g.normals[i]);
    for (let i = 0; i < g.uvs.length; i++) uvs.push(g.uvs[i]);
    for (let i = 0; i < g.indices.length; i++) indices.push(g.indices[i] + vertexBase);
    vertexBase += g.positions.length / 3;
    // **THE MATERIAL'S RECORD IS ITS NAME, NOT ITS POSITION.** The renderer's texture cache is
    // keyed `archive_record` and never cleared, so a *position* (0, 1, 2 …) names a different
    // picture in every level: leaving a shop for the street and back, or the fast travel from
    // a dungeon to a city, handed the new level whatever the old one had uploaded under that
    // number. That is the report — "the city has the previous level's assets" — and switching
    // pages was the only thing that hid it, because a page load throws the cache away.
    // `FILENAME#setIndex` says which picture this is in any level, so two levels that share a
    // wall texture share the upload and no level can ever wear another's art.
    const record = key;
    materials.push({ key, record, ref: g.ref, cutout: g.cutout });
    subMeshes.push({
      textureArchive: ARENA_TEXTURE_ARCHIVE,
      textureRecord: record,
      startIndex,
      primitiveCount: g.indices.length / 3,
      key,
      // Read by the renderer's world pass: this sub-mesh's texels are cut out where the
      // art is palette index 0 (signs, banners, hedges, laundry), rather than painted.
      cutout: g.cutout,
    });
  }
  stats.materials = materials.length;

  // ── pack the doors ─────────────────────────────────────────────────────────
  // One bundle per door, in the same shape as the level's, plus the hinge the scene
  // rotates it about and the collider slice it drops when it opens. A door whose art
  // this install lacks is reported instead of being drawn as nothing.
  const materialKeys = new Set(materials.map((m) => m.key));
  /** @type {object[]} */
  const doors = [];
  for (const door of doorRecords) {
    const dPositions = [];
    const dNormals = [];
    const dUvs = [];
    const dIndices = [];
    const dSubMeshes = [];
    let dVertexBase = 0;
    for (const [key, g] of door.groups) {
      if (!g.indices.length) continue;
      const startIndex = dIndices.length;
      for (let i = 0; i < g.positions.length; i++) dPositions.push(g.positions[i]);
      for (let i = 0; i < g.normals.length; i++) dNormals.push(g.normals[i]);
      for (let i = 0; i < g.uvs.length; i++) dUvs.push(g.uvs[i]);
      for (let i = 0; i < g.indices.length; i++) dIndices.push(g.indices[i] + dVertexBase);
      dVertexBase += g.positions.length / 3;
      if (!materialKeys.has(key)) {
        materialKeys.add(key);
        materials.push({ key, record: key, ref: g.ref, cutout: g.cutout });
      }
      dSubMeshes.push({
        textureArchive: ARENA_TEXTURE_ARCHIVE,
        textureRecord: key,
        startIndex,
        primitiveCount: g.indices.length / 3,
        key,
        cutout: g.cutout,
      });
    }
    if (!dSubMeshes.length) continue;
    doors.push({
      id: door.id,
      row: door.row,
      col: door.col,
      kind: door.kind,
      model: {
        positions: new Float32Array(dPositions),
        normals: new Float32Array(dNormals),
        uvs: new Float32Array(dUvs),
        indices: new Uint32Array(dIndices),
        subMeshes: dSubMeshes,
      },
      collider: {
        positions: new Float32Array(door.collider.positions),
        indices: new Uint32Array(door.collider.indices),
      },
      panel: door.panel,
      texture: dSubMeshes[0]?.textureRecord ?? null,
    });
  }
  stats.materials = materials.length;
  stats.doors = doors.length;

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
    doors,
    stats,
  };
}
