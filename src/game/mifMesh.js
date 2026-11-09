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

import { cellTexture, isVoidCell } from './mifLevel.js';
import { EDGE_FACES } from './mifLevel.js';

/** World units per MIF cell. See the note above. */
export const CELL_SIZE = 2.5;

/** Materials use this archive namespace in the renderer's texture table. */
export const ARENA_TEXTURE_ARCHIVE = 2;

/** Epsilon to keep coplanar quads from fighting. */
const EPS = 1e-4;

/**
 * How far below the floor each kind of chasm's bed lies, in world units.
 *
 * The owner, 2026-10-17: *"in dungeons there should be shallow pits you can climb instead of
 * just holes like in perfectarena and also the water should be deep and you should climb out of
 * it and in perfectarena this is not present, generally the ability to climb is needed"*.
 *
 * The port's one number used to be **0.45**, chosen so that the motor's own step-over
 * (`STEP_OFFSET` 0.5) walked a player out of every pool — which is why a chasm read as a
 * painted hole rather than as a pit or a pool, and why nothing in the game ever needed a
 * climb. The three depths here are the three things a chasm *is*:
 *
 *   * **dry — a pit.** 1.2 m: deeper than the step (0.5) so it is a pit and not a step, and
 *     under the body's own climb reach (`CLIMB_LEDGE_MAX` 1.6, `engine/player/motor.js`) so
 *     a player who falls in hauls themselves out. It is shallow on purpose — a pit, not a
 *     fatal drop (fall damage starts at 5 m).
 *   * **wet — water.** 1.55 m: past the waist and up to the chin of a 1.7 m eye, so the
 *     water *is* deep rather than ankle-deep — you cannot step out of it (0.5 m of step
 *     cannot climb 1.55) and you must climb the bank — while the head stays **clear of the
 *     surface** (`< EYE_HEIGHT`), so the scene's own wade (`updateWater`, which keeps the
 *     feet on the bed and the eye above the water) reads as deep water rather than as
 *     walking along the bottom. The bed is the deepest bed `CHASM_DEPTH` names, for a
 *     caller that wants one number.
 *   * **lava — the same hole, burning.** 1.0 m, with `ArenaChasmUtils::isDamaging` doing the
 *     damage the scene gives it; the climb is how a player gets back out of it.
 *
 * Nothing here is cosmetic: the bed is in the collider as well as the picture (the chasm pass
 * emits both into the one triangle soup), so a pit is felt at the depth it is drawn.
 */
export const CHASM_DEPTHS = Object.freeze({ dry: 1.2, wet: 1.55, lava: 1.0 });

/**
 * The bed depth for one cell's chasm kind, in world units.
 *
 * A cell that is a chasm of no named kind (a decoder that answered `true` rather than a word)
 * gets the **dry** pit, so a caller can never end up with a shallower hole than it asked for.
 *
 * @param {'dry'|'wet'|'lava'|null|undefined} chasm
 * @returns {number}
 */
export function chasmDepthOf(chasm) {
  return CHASM_DEPTHS[chasm] ?? CHASM_DEPTHS.dry;
}

/**
 * **One** chasm depth, for a caller that names only one: the deepest.
 *
 * Kept exported because the depth is read as a single number in the docs, the scene's prose
 * (`scenes/interior.js`) and the mesh pin (`tests/unit/mif.test.mjs`), and a caller asking
 * "how deep is a chasm" with no cell in hand should get the deepest answer rather than the
 * shallowest. The mesher itself uses `chasmDepthOf` per cell.
 */
export const CHASM_DEPTH = CHASM_DEPTHS.wet;

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
 * @param {{cellSize?:number, wantCollider?:boolean, upperStoreys?:boolean, boundaryWalls?:boolean}} [opts]
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
  const boundaryWalls = opts.boundaryWalls ?? false;
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
    doors: 0, upperBoxes: 0, roofQuads: 0, upperLayers: 0, boundaryQuads: 0,
    chasmUnderpasses: 0, chasmArches: 0,
  };

  const at = (row, col) => (row < 0 || col < 0 || row >= depth || col >= width ? null : cells[row * width + col]);

  /**
   * **A hedge is a box made of a picture with holes in it.**
   *
   * `NHEDGE.IMG`/`NHEDGED.IMG` (and the install's `XNHEDGED`, `T_NHEDGE`, `TZNHEDGE`) are the
   * garden walls of a settlement's parks and mazes, placed on `0x9` transparent voxels. Two of
   * Arena's own facts follow from that, and this port had neither:
   *
   *   * the art is **2% palette index 0**, so the cell behind it is visible through the hedge —
   *     and the ground the original keeps in every cell (`FLOR` is its own layer, under whatever
   *     stands on it) was skipped here as "a box hides its own floor". Looking at a hedge from
   *     the third-person camera, or standing close to one, showed the void under it;
   *   * the box is **four sides and no lid** (OpenTESArena's `TransparentWall` is explicitly
   *     one-sided on all four sides and has no top or bottom face — `ArenaMeshUtils::
   *     isFullyCoveringFacing`). In first person nobody could see over a hedge, so that was
   *     invisible. In this port's third person the camera looks down into an open-ended box
   *     whose inner faces are culled: the hedge line reads as a hole in the world.
   *
   * So a hedge cell gets **the floor under it** (drawn, and in the collider as every floor is),
   * in its own cut-out art — the ground the original's `FLOR` layer keeps under every cell. It
   * does **not** get a lid. The previous pass closed the open box with a cap in the hedge's own
   * art, and the owner rejected it on sight (2026-10-21): *"REMOVE THE WALL ABOVE THEM THAT YOU
   * CREATED IT LOOKS UGLY AND IT SHOULDNT BE THERE"*. A hedge is a hedge: four cut-out sides
   * from the ground up, open to the sky, exactly as Arena draws it. Seen from above in the third
   * person the ground beneath it is now there, which was the actual hole.
   */
  // **Any of the install's hedge art**, not only the two `NHEDGE` names: the archive also
  // ships `XNHEDGED`, `T_NHEDGE`, `TZNHEDGE` and the garden wall `T_GARDEN`, and a city or a
  // dungeon may bind any of them. The owner, 2026-10-21, still saw the hole in Elden Grove, so
  // the test is the family of art rather than one spelling of it — and a hedge drawn on a
  // `0x8` wall (some maps do) gets its ground too.
  const isHedgeWallCell = (cell) => Boolean(cell
    && (cell.kind === 'transparent' || cell.kind === 'wall')
    && /(?:NHEDGE|HEDGE|GARDEN)/i.test(cellTexture(cell, 'side', inf)?.filename ?? ''));

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

  /**
   * **Does this cell's own mesh cover *all* of every side it shares?** Only a full cube does.
   *
   * The question matters wherever two structures stand side by side: either may skip the face
   * between them as "drawn twice". A **door** is one panel at its cell's middle plane and a
   * **`0xD` diagonal** fills half its cell, so neither covers the boundary plane at all — and a
   * wall that skipped its face against one of them left a full-height slot on that plane, with
   * the level's own art missing from it: measured over the install's seventeen quest dungeons,
   * **36 675** such samples stood beside a wall or an arch (`.scratch/seam.mjs`). The owner,
   * 2026-10-17: *"there are walls at the angles that are used instead of making an angle like
   * connecting two walls … its still broken"* — the two walls *were* drawn, with a gap at the
   * angle between them that showed the void.
   */
  const wholeSides = (c) => fullBox(c) && (c.kind === 'wall' || c.kind === 'transparent');

  /**
   * **Is this cell's box in the collision soup?** A **gateway** is drawn exactly as it always was
   * and collides with nobody — the owner's own request, *"city gates should have no collision so I
   * can actually go into the wilderness"* — and it is a flag rather than `solid: false` because the
   * same reading decides the *drawing*: a solid transparent voxel is drawn as a full box, so clearing
   * `solid` would take the gate's own art away with the wall it stands in. The opening is marked by
   * `mifLevel.js`'s `openSettlementGate`, which reads it off the settlement's outermost line.
   */
  const collides = (cell) => Boolean(cell?.solid) && !cell.gateway;

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
  // **The margin around a level is not drawn.** A `.MIF` gives one grid for every level in the
  // file and a storey may fill less of it (`mifLevel.js`'s `levelCanvas`): the Fortress of Ice's
  // second floor is a 64×58 maze in an 80×96 grid, and the other 3 968 cells were drawn as a
  // floor and a ceiling around it — a hall the size of the level with no room in it, and no way
  // in. The owner: *"the second floor of the dungeon is bigger than what it should be"*. Nothing
  // is drawn there and nothing is collided there, so the level ends where its own walls do.
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const cell = cells[row * width + col];
      if (isVoidCell(cell)) continue;
      const x0 = row * S, x1 = (row + 1) * S;
      const z0 = col * S, z1 = (col + 1) * S;

      // The floor is normally hidden when a solid box stands on it, and a chasm cell has
      // no floor at the surface at all: what it has is a bed, below (`chasmFloor`, further down).
      // Hedge side textures have transparent pixels, so keep the ordinary ground visible under
      // their cells. This fills the apparent hole without adding a top cap or changing wall height.
      //
      // **A door is the exception.** A door stands *in* a doorway, and the floor under it
      // is the threshold a player walks over: hiding it made the cell a hole in the floor
      // the moment the door swung open. The box still owns its own sides; the floor is drawn.
      // **A diagonal is not a box either.** It fills half its cell (the prism in the
      // structure pass), so the other half is air a body can stand in — and with the floor
      // hidden as "under a box" that air half had no floor in the picture at all: measured
      // across the install's quest dungeons, **22 272 of 22 288** samples of a diagonal cell's
      // own area had no drawn floor under them (`.scratch/seam.mjs`), so every chamfer in the
      // game had a black notch in the floor at its foot. The floor is drawn, as a door's is.
      const coveredByFullBox = fullBox(cell) && cell.kind !== 'door' && cell.kind !== 'diagonal';
      const showGroundUnderHedge = isHedgeWallCell(cell);
      if ((!coveredByFullBox || showGroundUnderHedge) && !cell.floor.chasm) {
        // **A hedge cell with no floor art of its own still has the level's ground.** `0x9`
        // transparent voxels are sometimes left without a floor binding; the install's own
        // `*FLOR` art is the ground every cell of that level stands on, so it is the fallback
        // rather than a second hole.
        const floorRef = cellTexture(cell, 'floor', inf)
          ?? (showGroundUnderHedge ? inf?.voxelTextures?.find((ref) => /FLOR/i.test(ref?.filename ?? '')) : null);
        const g = group(floorRef);
        const y = floorTop * S;
        quad(g, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], unitUv, true);
        stats.floorQuads++;
      } else if (coveredByFullBox && !showGroundUnderHedge && !cell.floor.chasm) {
        // No cell of a level may be bottomless. The floor under a solid box is invisible —
        // the box hides it — but it has to be *there* in the collider, or anything that
        // stands inside the box falls out of the level for good.
        const y = floorTop * S;
        collideQuad([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]]);
      } else if (coveredByFullBox && cell.floor.chasm) {
        // **A wall standing in a pool is an arch, and the water runs under it.** The owner,
        // 2026-10-19: *"water pits and pits … are actually sometimes used as tubes to connect
        // two rooms otherwise inaccessible without this … those tubes exist because you can
        // even see them in the minimap but are sealed off"*. Arena's wall voxel begins at the
        // **floor plane**; a chasm's bed is 1.2–1.55 m below it, so the band between bed and
        // floor is open water — the tube. Its underside had no picture at all (the wall starts
        // at the floor, and the floor pass skips a chasm cell), so a swimmer looking up through
        // the passage saw the ceiling through the wall's own hollow box. This draws the arch's
        // underside there. It is **not** collided: the swimmer's head must pass under it.
        const ref = group(cellTexture(cell, 'bottom', inf) ?? cellTexture(cell, 'side', inf));
        if (ref) {
          quad(ref, [[x0, floorTop * S, z0], [x0, floorTop * S, z1],
            [x1, floorTop * S, z1], [x1, floorTop * S, z0]], [0, -1, 0], unitUv, false);
          stats.chasmArches++;
        }
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
        // **A sign is drawn from BOTH sides.** The owner, 2026-10-17: *"all pngs that are
        // fixed in place like signs or feces need to be visible from both sides"*. The panel
        // hangs on one face of its cell and the first version emitted that face alone — and
        // the world pass culls back faces under a mirrored projection, exactly the reason the
        // door below emits two quads — so walking round a shop's board or a tavern's made it
        // disappear. Both quads stand on the same corners with a normal each way, like the
        // door's own panel: each is seen from its own side only, and two coplanar faces that
        // are never visible together cannot z-fight.
        const ref = group(cellTexture(cell, 'side', inf), true);
        const uv = [[0, 0], [1, 0], [1, tiles], [0, tiles]];
        quad(ref, corners, n, uv, collides(cell));
        quad(ref, corners, [-n[0], -n[1], -n[2]], uv, collides(cell));
        continue;
      }

      if (cell.kind === 'diagonal') {
        // ── a diagonal is a CORNER, not a floating panel ─────────────────────
        //
        // A thin wall across the cell's diagonal. Both sides are emitted so the
        // slab is opaque from either direction without relying on culling.
        //
        // **And the half behind it is filled.** Every shipped dungeon's diagonals are a 45°
        // chamfer joining two wall runs — read off `42026882.MIF`'s second level, the `\`/`/`
        // cells step one cell per row beside a wall mass, which is an octagonal room's corner —
        // and a single 0.15 m panel leaves that corner hollow: the angled face does not meet the
        // walls at either end, so the join reads as a vertical slab standing in the air. The
        // owner, 2026-10-17: *"there are walls at the angles that are used instead of making an
        // angle like connecting two walls"*.
        //
        // So the solid half is emitted as the **prism** the corner is: the diagonal face (both
        // ways), the two cell-boundary faces of that half (skipped where a neighbouring wall
        // already draws them, and skipped off the map where the boundary pass above owns the
        // edge), and a cap where the cell is under open sky.
        //
        // The solid half is **measured from the map, not taken from the bit**: over six of the
        // install's quest dungeons the 779 diagonals split 179 with walls on the `+x/+z` side
        // against 165 on the `-x/-z` side under the same facing bit, so the bit cannot be the
        // answer on its own. The half whose two neighbours are walls wins; a diagonal with no
        // wall neighbour at all (most of facing 0: 371 of 372) keeps the bit's own half, which is
        // the freestanding angled panel this used to draw alone.
        const right = cell.facing === 0;
        const runPlus = fullBox(at(row + 1, col)) && fullBox(at(row, col + 1));
        const runMinus = fullBox(at(row - 1, col)) && fullBox(at(row, col - 1));
        // `plus` = the triangle (D, B, C) — the +x/+z corner; `minus` = (D, B, A) — the -x/-z one.
        const solidPlus = runPlus ? true : runMinus ? false : !right;
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
        stats.wallQuads += 2;

        // ── the wedge: the half-cell the panel cuts off, emitted as the prism it is ──
        //
        // `endA`/`endB` are the panel's own end points — the two cell corners the map's own bit
        // names — and `cornerPlus`/`cornerMinus` are the two corners they separate, so the half
        // to fill is the triangle (endA, endB, corner) for the corner the map asks for.
        const endA = right ? [x0, z1] : [x0, z0];
        const endB = right ? [x1, z0] : [x1, z1];
        const cornerPlus = right ? [x1, z1] : [x1, z0];
        const cornerMinus = right ? [x0, z0] : [x0, z1];
        const corner = solidPlus ? cornerPlus : cornerMinus;
        /**
         * One boundary face of the wedge: the cell plane both points lie on.
         *
         * The corner order is the level's own convention, which the upright-texture check in
         * `tests/unit/mif.test.mjs` holds every wall to: **u runs along `(-n.z, 0, n.x)`** — so
         * the order follows the face's normal and not the order the points arrive in. (The first
         * version of this emitted the four corners without regard to it, and the texels came out
         * mirrored on the two faces it got backwards.)
         *
         * A face a cube beside it already draws is left to the cube (`wholeSides`), which is what
         * keeps a chamfer from doubling every wall it touches. Off the map the neighbour is null
         * and the face is drawn.
         */
        const wedgeFace = (from, to) => {
          stats.wallQuads++;
          if (Math.abs(from[1] - to[1]) < EPS) {
            const z = from[1];
            const plus = z > (z0 + z1) / 2;
            if (wholeSides(at(row, col + (plus ? 1 : -1)))) return;
            const [xa, xb] = plus ? [Math.max(from[0], to[0]), Math.min(from[0], to[0])]
              : [Math.min(from[0], to[0]), Math.max(from[0], to[0])];
            quad(g, [[xa, bottom, z], [xb, bottom, z], [xb, top, z], [xa, top, z]], [0, 0, plus ? 1 : -1], unitUv, true);
          } else {
            const x = from[0];
            const plus = x > (x0 + x1) / 2;
            if (wholeSides(at(row + (plus ? 1 : -1), col))) return;
            const [za, zb] = plus ? [Math.min(from[1], to[1]), Math.max(from[1], to[1])]
              : [Math.max(from[1], to[1]), Math.min(from[1], to[1])];
            quad(g, [[x, bottom, za], [x, bottom, zb], [x, top, zb], [x, top, za]], [plus ? 1 : -1, 0, 0], unitUv, true);
          }
        };
        wedgeFace(endA, corner);
        wedgeFace(endB, corner);
        // The corner itself: the quarter-cell triangle the two faces and the panel meet over, and
        // only under open sky — indoors the cell's own ceiling quad is the lid (`decodeMap2`), and
        // a second one at the same height would z-fight with it. Wound the way an up-facing quad
        // is, because the world pass culls back faces.
        if (!cell.ceiling) {
          quad(g, [[corner[0], top, corner[1]], [endB[0], top, endB[1]], [endA[0], top, endA[1]], [endA[0], top, endA[1]]],
            [0, 1, 0], unitUv, false);
          stats.wallQuads++;
        }
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

      // ── WHICH FACES ARE PICTURES WITH A HOLE IN THEM ─────────────────────────
      //
      // A `0x9` transparent wall (an arch, a hedge, a gate) is one, and so is a **raised
      // platform's side** — the second half of the same law, and the half the owner kept
      // reporting: *"not the small 2d tables the 3d tables … this tables and beds have black
      // in their textures that should be invisible so i can see under them"*.
      //
      // **The original's own renderer draws them that way.** OpenTESArena's
      // `MapGeneration.cpp` (`writeVoxelInfoForMAP1`) hands a raised platform
      // `FragmentShaderType::AlphaTested` for its **sides** and `Opaque` for its top and
      // bottom (`outFragmentShaderTypes[0]` vs `[1]`/`[2]`), while a regular solid wall is
      // `Opaque` in all three. That is not decoration: the furniture of a house *is* a raised
      // box — a table is the box whose `*BOXSIDE` art is `TABLE.IMG`, a bed the one whose art
      // is `BED.IMG` (`@WALLS`'s `*BOXSIDE` slots, `.INF`'s own table) — and those two records
      // are **pictures of a table and a bed with the room showing through them**: measured,
      // `TABLE.IMG` is 37.1% palette index 0 and `BED.IMG` 84.9%, the index-0 regions being
      // exactly the space under a tabletop and around a bed frame.
      //
      // Drawn opaque, those regions were **black slabs standing in the room** — the reported
      // black under the 3D tables and beds. The slice a side face shows makes it worse rather
      // than better: the art is mapped by height from the floor (`v` 0…`yOffset + ySize`, which
      // is OpenTESArena's `vTop`/`vBottom` read bottom-up), so a low box shows the *bottom*
      // strip of the picture, and the bottom strip of `BED.IMG` is mostly its own cutout.
      //
      // **The treatment travels with the kind, and nothing else on screen moves.** Measured
      // over all 533 shipped `.MIF`s: 47 distinct art records are used on raised sides, and
      // only **four** carry a hole above 1% — `BED.IMG` (84.9%, 189 cells), `WCAS.IMG` (68.4%,
      // the well's water sides), `CASLAVA.IMG` (62.4%, a lava pit's sides) and `TABLE.IMG`
      // (37.1%, 460 cells). Every other raised side is 0.0% index 0, so cutting out where the
      // reference cuts out changes their picture not at all. A wall keeps its own law — its art
      // is masonry, and the few index-0 texels some of it carries (`WALL_D05`/`D06`, 0.6–0.7%)
      // are the cracks the original paints black, not holes.
      const cutout = cell.kind === 'transparent' || cell.kind === 'raised';
      const tiles = Math.max(topCell - bottomCell, 0.05);
      // A face is skipped when the neighbour already draws the same surface: both
      // cells full boxes, or both raised platforms of equal span.
      const hideAgainst = (n) => {
        if (!n) return false;
        // Only a face between **two cubes** is drawn twice (`wholeSides`). A door hides
        // nothing: its own cell is a doorway, and the faces around it are the jambs the
        // player looks at once the door swings. A diagonal hides nothing either, and hides
        // nothing *behind* it: the wall beside it must keep its own face, or the angle
        // between the two walls is a slot (see `wholeSides`).
        if (wholeSides(cell) && wholeSides(n)) return true;
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
        quad(group(sideRef, cutout), s.corners, s.n, [[0, 0], [1, 0], [1, tiles], [0, tiles]], collides(cell));
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
        // Arches and hedges are open-topped one-sided panels; nothing else to emit. A hedge gets
        // its ground (above) and **no lid** — the owner's 2026-10-21 correction of the lid this
        // pass first added: *"REMOVE THE WALL ABOVE THEM THAT YOU CREATED IT LOOKS UGLY"*.
      } else if (!cell.ceiling) {
        // A full box under open sky needs a lid, or the player sees through it.
        quad(group(capRef, cutout), [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]], [0, 1, 0], unitUv, true);
      }
    }
  }

  // ── THE EDGE OF THE MAP ────────────────────────────────────────────────────
  //
  // **Arena's levels simply stop.** The outer ring of a `.MIF` carries no wall of its own —
  // measured across the install's sixteen quest dungeons, the whole ring is walkable open air:
  // Dagoth-Ur, Black Gate and the Halls of Colossus each have **396 of a 100×100 level's 396
  // ring cells open**, the Crypt of Hearts 396, Selene's Web 296, and the palace 195 of 196 per
  // level. So every wall at the edge of the picture stands in the air, the player walks off the
  // side of the world, and the owner's report follows:
  //
  //   *"main story dungeons walls at some angles instead of connecting two walls are vertical and
  //   lead off the map … the shallow pits you can climb lead off the map and also the water pits"*.
  //
  // The original confines a player to the map's own rectangle; the port drew what the data held
  // and nothing else, so the level had no edges. This pass builds the wall the data never needed:
  // one quad on every **outward** face of the ring, plus its collision, drawn in the **level's own
  // wall art** (the side texture its own walls use most, so Dagoth-Ur's edge is Dagoth-Ur's stone)
  // and run down to a chasm's bed so a ring cell that is a pit is closed under the water line too.
  //
  // Two cells are deliberately left open:
  //
  //   * a **structure** (`fullBox`), whose own sides are already drawn; and
  //   * a **gateway** — the opening `mifLevel.js`'s `openSettlementGate` cuts in a settlement's
  //     outermost line. Sealing that would wall a city's gate shut, which is the owner's own
  //     earlier request undone (*"CITY GATES SHOULD HAVE NO COLLISION SO I CAN ACTUALLY GO INTO
  //     THE WILDERNESS"*).
  //
  // It is **off by default** and the scene asks for it on the levels that are a closed map — not
  // on a country page, whose window is a slice of an endless grid and must stay crossable for the
  // scene to re-centre as the player walks (D-36).
  if (boundaryWalls) {
    // The level's own wall art: the side texture most of its walls are drawn with.
    const counts = new Map();
    for (const cell of cells) {
      if (cell?.kind !== 'wall' || !(cell.sideTexture >= 0)) continue;
      counts.set(cell.sideTexture, (counts.get(cell.sideTexture) ?? 0) + 1);
    }
    let commonest = -1;
    let most = 0;
    for (const [index, count] of counts) if (count > most) { commonest = index; most = count; }
    const sample = cells.find((c) => c?.kind === 'wall' && c.sideTexture === commonest)
      ?? cells.find((c) => c?.kind === 'wall') ?? cells[0];
    const ref = group(cellTexture(sample, 'side', inf));
    if (ref) {
      for (let row = 0; row < depth; row++) {
        for (let col = 0; col < width; col++) {
          const cell = cells[row * width + col];
          if (fullBox(cell) || cell.gateway) continue;
          const chasm = cell.floor.chasm;
          const x0 = row * S, x1 = (row + 1) * S;
          const z0 = col * S, z1 = (col + 1) * S;
          // Down to a chasm's own bed, so the pit at the map's edge is closed as deep as it is.
          const bottom = (chasm ? floorTop - chasmDepthOf(chasm) : floorTop) * S;
          const top = roomTop * S;
          const uv = [[0, 0], [1, 0], [1, (top - bottom) / S], [0, (top - bottom) / S]];
          const faces = [];
          if (row === 0) faces.push({ n: [-1, 0, 0], corners: [[x0, bottom, z0], [x0, bottom, z1], [x0, top, z1], [x0, top, z0]] });
          if (row === depth - 1) faces.push({ n: [1, 0, 0], corners: [[x1, bottom, z0], [x1, bottom, z1], [x1, top, z1], [x1, top, z0]] });
          if (col === 0) faces.push({ n: [0, 0, -1], corners: [[x0, bottom, z0], [x1, bottom, z0], [x1, top, z0], [x0, top, z0]] });
          if (col === width - 1) faces.push({ n: [0, 0, 1], corners: [[x0, bottom, z1], [x1, bottom, z1], [x1, top, z1], [x0, top, z1]] });
          for (const face of faces) {
            quad(ref, face.corners, face.n, uv, true);
            stats.boundaryQuads++;
          }
        }
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
  // default, 100 Arena units ≈ 0.78 cell) rather than the level's. This build sinks the bed
  // by the cell's own kind (`chasmDepthOf`): a dry chasm is a **pit** you climb out of, a wet
  // one is **deep water** you climb out of, and a lava one burns while you do it. The old
  // single 0.45 m shelf was chosen so the motor's own step-over could always leave the pool,
  // which is exactly why a chasm never read as a hole and the game never needed a climb.
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const cell = cells[row * width + col];
      if (!cell.floor.chasm) continue;
      const x0 = row * S, x1 = (row + 1) * S;
      const z0 = col * S, z1 = (col + 1) * S;
      const surface = floorTop * S;
      const bed = surface - chasmDepthOf(cell.floor.chasm);
      const g = group(cellTexture(cell, 'floor', inf));
      quad(g, [[x0, bed, z0], [x0, bed, z1], [x1, bed, z1], [x1, bed, z0]], [0, 1, 0], unitUv, true);
      stats.chasmBeds++;
      // The bank is as tall as the bed is deep, which is what the climb needs: the lip of a
      // wet chasm stands 1.55 m over its bed and a dry one 1.2, and every one of them is a
      // face the motor's ledge probe can find and haul the body over.

      // The rim, where another chasm does not continue: both sides are emitted, so the
      // shallow bank is not a hole when it is seen from the water rather than from land.
      const rims = [
        { n: [-1, 0, 0], nb: at(row - 1, col), corners: [[x0, bed, z0], [x0, bed, z1], [x0, surface, z1], [x0, surface, z0]] },
        { n: [1, 0, 0], nb: at(row + 1, col), corners: [[x1, bed, z0], [x1, bed, z1], [x1, surface, z1], [x1, surface, z0]] },
        { n: [0, 0, -1], nb: at(row, col - 1), corners: [[x0, bed, z0], [x1, bed, z0], [x1, surface, z0], [x0, surface, z0]] },
        { n: [0, 0, 1], nb: at(row, col + 1), corners: [[x0, bed, z1], [x1, bed, z1], [x1, surface, z1], [x0, surface, z1]] },
      ];
      for (const rim of rims) {
        // The pool continues — but **only where it stays open water**. A wall standing in a
        // flooded room carries the same chasm floor as the water beside it, and asking the
        // *floor* alone read that as "the pool goes on" and left the bank out: the water's own
        // bank under the wall, which is the last of the two reasons a body on a bed could walk
        // into the rock (25 990 open sides before this pass, 11 940 after the structure skip
        // alone, 0 after this — measured over the install's seventeen quest dungeons with
        // `.scratch/pitprobe.mjs`). What continues is the pool *cell*: not solid, water floor.
        if (rim.nb && !rim.nb.solid && rim.nb.floor.chasm) continue;
        // **A wall standing in the pool does not close the tube.** The same reading — the pool
        // *cell* continues, and a solid cell over a chasm floor is a wall whose own box starts
        // at the floor plane — means the water passes **under** it. Emitting the bank here
        // sealed every such passage from bed to surface: measured on `START.MIF`, the four-cell
        // water run at column 8 stopped dead at the wall in cell (40,8)+2 — the body at the bed,
        // W held, ten seconds and not a centimetre further — while the minimap painted all four
        // cells as water (the reference paints wet chasms under a wall as water too, precisely
        // because you swim under it). The wall's box above the surface is still the wall it was;
        // only the band below the water line opens, which is the owner's *"tubes"*.
        if (rim.nb && rim.nb.solid && rim.nb.floor.chasm) {
          stats.chasmUnderpasses++;
          continue;
        }
        // **A structure does NOT already draw this face** — its own sides start at the FLOOR
        // PLANE (`spanOf`), and the bank runs from the *bed* up to that plane, so the two never
        // overlap. Skipping the bank where the neighbour was a box left the whole band between
        // bed and floor open: measured across the install's seventeen quest dungeons, **25 990**
        // sides of a pit had nothing in them, every one a doorway at chest height into the rock
        // — from `39950681`'s second level (4 009 of them, the Black Gate's flooded floor) down
        // to `42026882`'s third (26). The player walked off the bed into the wall, and from
        // inside the wall the level has no floor at all, so the next step was off the map:
        // the owner's *"i still fall off maps in pits and water pits … and you can go outside
        // boundaries of the dungeon"*.
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
