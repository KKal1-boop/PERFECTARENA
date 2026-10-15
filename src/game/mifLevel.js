// `.MIF` LAYERS -> A WALKABLE LEVEL.
//
// This is where Arena's voxel bitfields become a model the mesher and the game
// can use. Everything below was established against OpenTESArena's
// `MapGeneration`/`ArenaLevelUtils` and then re-checked against real files —
// `tools/lib/mapascii.mjs` prints a decoded level as ASCII, and the result is
// recognisably a dungeon. See docs/FORMATS.md §3.
//
// ## The three layers, and why the level is only one voxel layer tall
//
// A `.MIF` level is three grids of 16-bit voxel IDs that the original stacks
// vertically:
//
//   FLOR   → voxel layer 0    the floor slab (and any flat lying on it)
//   MAP1   → voxel layer 1    walls, doors, platforms, fences, chasms, entities
//   MAP2   → voxel layers 2+  the ceiling and the solid mass above it
//
// A layer is `ceilingScale = *CEILING height / 128` world units tall and a cell
// is 1×1 horizontally. Layer 0 is a solid slab, so the player *walks on top of
// it* at `y = ceilingScale` and looks up at the ceiling's underside at
// `y = 2·ceilingScale`. **The whole playable volume is layer 1.** That is why
// Arena is a first-person grid game rather than a 3D one, and it is why the
// mesher only has to emit floors, ceilings and one layer of boxes.
//
// ## A cell has a floor *and* a structure
//
// These are independent: the FLOR voxel says what you stand on, the MAP1 voxel
// says what is standing there. Keeping them in one field conflates a wall with
// the floor beneath it, which is why `LevelVoxel.floor` and `LevelVoxel.kind`
// are separate below.
//
// ## The bitfields
//
//   FLOR   texture = (id & 0xFF00) >> 8   flat index = (id & 0x00FF) − 1
//          texture 0xC / 0xD / 0xE = dry / wet / lava chasm
//          texture 0 is a normal floor when the whole voxel is 0
//   MAP1   the most-significant *nibble* picks the kind:
//          0x8  an entity (flat, NPC, door trigger) — no geometry
//          0x9  transparent wall (arch)  texture = (id & 0xFF) − 1
//          0xA  edge (fence, gate, sign) texture = (id & 0x3F) − 1, face = (id & 0xC0) >> 6,
//               height = (id & 0xE00) >> 9, collides when bit 0x100 is set
//          0xB  door                     texture = (id & 0x3F) − 1, kind = (id & 0xC0) >> 4
//          0xC  undocumented             — treated as air
//          0xD  diagonal wall            texture = (id & 0xFF) − 1, bit 0x100 picks the diagonal
//          else, with bit 0x8000 clear: `texture = (id & 0x7F00) >> 8`,
//               `other = id & 0x7F`; **equal ⇒ solid wall**, otherwise a raised
//               platform whose most-significant byte is `0x0tttthhh`
//   MAP2   non-zero ⇒ there is a ceiling here, `(id & 0x7F) − 1` is its texture.
//          Zero ⇒ **open sky above**, which is how Arena draws outdoor streets.
//
// ## Coordinates
//
// `world X = MIF row index`, `world Z = MIF column index`. The transposition is
// deliberate: it is what OpenTESArena does (`VoxelUtils::originalVoxelToWorldVoxel`)
// and it is what makes the `0xA` face codes below order the same way as the
// original's north/east/south/west.

import { voxelTexture } from '../arena/infFile.js';
import { platformTables } from './tables/raisedPlatforms.js';

/** Arena's "centimetre-like" unit: the width of one grid cell. */
export const ARENA_UNITS = 128;
/** The layer the floor slab occupies. */
export const FLOOR_LAYER = 0;
/** The layer the player occupies. */
export const PLAYER_LAYER = 1;
/** The lowest layer a ceiling voxel occupies. */
export const CEILING_LAYER = 2;
/** Player eye height above the feet, in Arena units (`ArenaPlayerUtils::EyeHeight`). */
export const EYE_HEIGHT = 60;
/** Chasm texture IDs in a FLOR voxel. */
export const CHASM_DRY = 0x0c;
export const CHASM_WET = 0x0d;
export const CHASM_LAVA = 0x0e;

/**
 * `(id & 0xC0) >> 6` of a 0xA voxel → a face of the cell, in world axes.
 * Index 0 is "north" as Arena labels it, which is −X in world space.
 */
export const EDGE_FACES = Object.freeze([
  { name: 'north', normal: [-1, 0, 0], tangent: 'z' },
  { name: 'east', normal: [0, 0, 1], tangent: 'x' },
  { name: 'south', normal: [1, 0, 0], tangent: 'z' },
  { name: 'west', normal: [0, 0, -1], tangent: 'x' },
]);

/** `(id & 0xC0) >> 4` of a 0xB voxel → how the door opens. */
export const DOOR_KINDS = Object.freeze(['swinging', 'sliding', 'raising', 'splitting']);

/**
 * @typedef {object} LevelFloor
 * @property {number} texture      index into `inf.voxelTextures`
 * @property {number} flatIndex    FLOR flat index, or -1
 * @property {'dry'|'wet'|'lava'|null} chasm
 */

/**
 * @typedef {object} LevelVoxel
 * @property {number} x              MIF column (world Z)
 * @property {number} z              MIF row (world X)
 * @property {LevelFloor} floor
 * @property {'air'|'wall'|'raised'|'door'|'edge'|'transparent'|'diagonal'|'entity'} kind
 * @property {number} sideTexture    index, or -1
 * @property {number} capTexture     raised platforms' top, or -1
 * @property {number} bottomTexture  raised platforms' underside, or -1
 * @property {number} yOffset        metres above the floor surface
 * @property {number} ySize          box height in metres (0 = up to the ceiling)
 * @property {number} facing         0..3 for edges and diagonals, -1 otherwise
 * @property {string|null} doorKind
 * @property {'up'|'down'|null} stair  the stairway this wall is, if it is one
 * @property {boolean} solid         blocks the player?
 * @property {number} entityFlatIndex  MAP1 0x8 voxels' flat index, or -1
 * @property {boolean} ceiling
 * @property {number} ceilingTexture index, or -1
 * @property {number} upperLayers    storeys of **mass above** the ceiling line (MAP2's height
 *   class, 0 when the cell has none) — the building's upper floors, in the original's own data
 * @property {boolean} upperRaised   true when MAP2's voxel is a raised box rather than a wall
 * @property {number} rawFlor
 * @property {number} rawMap1
 * @property {number} rawMap2
 */

/**
 * @typedef {object} ArenaLevel
 * @property {number} width           cells along world Z (MIF columns)
 * @property {number} depth           cells along world X (MIF rows)
 * @property {number} ceilingScale    the INF ceiling height in cell units (metadata)
 * @property {number} layerCount      `2 + max(MAP2 height class)`, or 2/3 without MAP2
 * @property {number} floorY          Y of the walkable floor surface, in cells (= 1)
 * @property {number} ceilingY        Y of the ceiling's underside, in cells (= 2)
 * @property {boolean} outdoors       open sky over the whole level
 * @property {import('../arena/infFile.js').InfFile} inf
 * @property {LevelVoxel[]} cells     indexed `row * width + col`
 * @property {{x:number,z:number}[]} startPoints  world positions
 * @property {{x:number,y:number,z:number}|null} spawn
 * @property {Record<string, number>} stats
 */

/**
 * Decode one `.MIF` level into a walkable model.
 *
 * @param {import('../arena/mifFile.js').MifLevel} level
 * @param {import('../arena/infFile.js').InfFile} inf
 * @param {{width:number, depth:number, mapType?:'interior'|'city'|'wilderness', startPoints?:{x:number,y:number}[]}} opts
 *   `startPoints` overrides the level's own start points (Arena keeps them in the `.MIF`
 *   header, one set per *file* rather than per level) — a building entered through the
 *   street door arrives at the `.MIF`'s own start point, which is the bottom of its entry
 *   corridor, and a caller that wants the plain spiral simply leaves this out.
 * @returns {ArenaLevel}
 */
export function decodeLevel(level, inf, opts) {
  const { width, depth, mapType = 'interior' } = opts;
  if (!level.map1 && !level.flor) throw new Error('level has neither MAP1 nor FLOR');

  const ceilingScale = (inf?.ceiling?.height ?? 100) / ARENA_UNITS;
  const layerCount = levelHeight(level, inf);
  // Everything this module reports is in CELL units (1 = the width of a grid
  // cell). The mesher multiplies by its own cell size, so the same model works
  // whether a cell ends up 2.5 world units across or 1.
  const floorY = FLOOR_LAYER + 1;
  const ceilingY = CEILING_LAYER;
  const tables = platformTables(mapType);
  const hasMap2 = Boolean(level.map2);

  /** @type {LevelVoxel[]} */
  const cells = new Array(width * depth);
  const stats = {
    air: 0, wall: 0, raised: 0, door: 0, edge: 0, transparent: 0, diagonal: 0, entity: 0,
    chasm: 0, ceilinged: 0, noFloor: 0,
  };

  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const cell = makeCell(col, row);
      cell.rawFlor = level.flor ? level.flor[i] : 0;
      cell.rawMap1 = level.map1 ? level.map1[i] : 0;
      cell.rawMap2 = level.map2 ? level.map2[i] : 0;

      decodeFlor(cell, inf);
      decodeMap1(cell, inf, tables, mapType);
      decodeMap2(cell, inf, hasMap2);
      cell.stair = stairKindOf(cell, inf);

      cells[i] = cell;
      stats[cell.kind] = (stats[cell.kind] ?? 0) + 1;
      if (cell.floor.chasm) stats.chasm++;
      if (cell.ceiling) stats.ceilinged++;
      if (!cell.rawFlor) stats.noFloor++;
    }
  }

  const startPoints = (opts.startPoints ?? level.startPoints ?? [])
    .map((p) => ({ x: p.y / ARENA_UNITS, z: p.x / ARENA_UNITS }));
  const spawn = pickSpawn(cells, width, depth, startPoints, floorY);

  return {
    width, depth, ceilingScale, layerCount, floorY, ceilingY,
    outdoors: hasMap2 ? stats.ceilinged === 0 : Boolean(inf?.ceiling?.outdoorDungeon),
    inf, cells, startPoints, spawn, stats,
  };
}

/** @returns {LevelVoxel} */
function makeCell(x, z) {
  return {
    x, z,
    floor: { texture: 0, flatIndex: -1, chasm: null },
    kind: 'air',
    sideTexture: -1, capTexture: -1, bottomTexture: -1,
    yOffset: 0, ySize: 0, facing: -1, doorKind: null, solid: false,
    stair: null,
    entityFlatIndex: -1,
    ceiling: false, ceilingTexture: -1, upperLayers: 0, upperRaised: false,
    rawFlor: 0, rawMap1: 0, rawMap2: 0,
  };
}

/**
 * How many voxel layers tall the level is:
 * `2 + max(MAP2 height class)` with MAP2, else 3 indoors and 2 outdoors.
 *
 * @param {import('../arena/mifFile.js').MifLevel} level
 * @param {import('../arena/infFile.js').InfFile} inf
 * @returns {number}
 */
export function levelHeight(level, inf) {
  if (level.map2) {
    let max = 1;
    for (let i = 0; i < level.map2.length; i++) max = Math.max(max, map2HeightClass(level.map2[i]));
    return 2 + max;
  }
  const hasCeiling = inf && !inf.ceiling.outdoorDungeon;
  return hasCeiling ? 3 : 2;
}

/**
 * MAP2 height class: bit 0x80 ⇒ 2, 0x8000 ⇒ 3, both ⇒ 4 (checked first order
 * matters: 0x80 wins), else 1. (`ArenaLevelUtils::getMap2VoxelHeight`.)
 *
 * @param {number} id
 * @returns {number}
 */
export function map2HeightClass(id) {
  if ((id & 0x80) === 0x80) return 2;
  if ((id & 0x8000) === 0x8000) return 3;
  return 1;
}

/**
 * FLOR: the floor's texture, any flat on it, and whether it is a chasm.
 * A zero voxel is still a floor — the original renders `voxelTextures[0]` there.
 */
function decodeFlor(cell, inf) {
  const id = cell.rawFlor;
  const textureId = (id & 0xff00) >> 8;
  cell.floor = { texture: voxelIndexOf(inf, textureId), flatIndex: -1, chasm: null };

  if (textureId === CHASM_DRY || textureId === CHASM_WET || textureId === CHASM_LAVA) {
    cell.floor.chasm = textureId === CHASM_DRY ? 'dry' : textureId === CHASM_WET ? 'wet' : 'lava';
    const index = textureId === CHASM_DRY ? inf?.dryChasmIndex
      : textureId === CHASM_WET ? inf?.wetChasmIndex : inf?.lavaChasmIndex;
    if (index !== null && index !== undefined) cell.floor.texture = voxelIndexOf(inf, index);
  }

  const flat = id & 0x00ff;
  if (flat > 0) cell.floor.flatIndex = flat - 1;
}

/**
 * Is this raw MAP1 voxel a **wall** — the `most === least` block the mesher draws solid?
 *
 * **The one reading of a voxel.** This is `decodeMap1`'s own wall branch lifted out, because a
 * second copy of it grew in `game/dungeonPlan.js` and the two disagreed: that copy also demanded
 * the voxel's high nibble be `0`, and the pieces this install ships build their walls out of
 * **nibble 1 and 3** cells (`0x1717`, `0x1a1a`, `0x3b3b` — the decoder reaches their `most ===
 * least` branch without ever looking at the nibble). So the copy found no wall at all in a real
 * dungeon: `dungeonPlan.commonWallVoxel` answered `0` for every assembled level, the boundary
 * pass sealed nothing, and `stampExit` refused every real wall.
 *
 * @param {number} id  a raw `MAP1` value
 * @returns {boolean}
 */
export function isWallVoxel(id) {
  if (!id) return false;                                   // air
  const nibble = (id & 0xf000) >> 12;
  // The shapes the decoder answers before it ever tests `most === least`: an entity (`0x8`, art
  // on the floor), an arch (`0x9`), a fence or sign (`0xa`), a door (`0xb`), the undocumented
  // air (`0xc`) and a diagonal (`0xd`) are all *not* a plain wall whatever their bytes say.
  if (nibble >= 0x8 && nibble <= 0xd) return false;
  if ((id & 0x8000) !== 0) return false;
  return ((id & 0x7f00) >> 8) === (id & 0x007f);
}

/**
 * Could a player stand in this cell, read off the **raw** voxels alone?
 *
 * `decodeLevel`'s own answer (`!cell.solid || cell.kind === 'door'`, and never on a chasm), for
 * a caller that has not decoded the level yet — the dungeon assembler works on voxels, and this
 * is the same reading the mesher, the collider and the player will get.
 *
 * @param {number} id     a raw `MAP1` value
 * @param {{chasm?: boolean}} [opts]  the `FLOR` layer's own verdict for the cell
 * @returns {boolean}
 */
export function rawPassable(id, opts = {}) {
  if (opts.chasm) return false;
  if (!id) return true;                                    // air
  const nibble = (id & 0xf000) >> 12;
  if (nibble === 0x8) return true;                         // art on the floor, not a wall
  if (nibble === 0x9) return (id & 0x0100) === 0;          // an arch is solid only with 0x100 set
  if (nibble === 0xa) return (id & 0x0100) === 0;          // a fence or a sign is solid only so
  if (nibble === 0xb) return true;                         // a door, which the player opens
  if (nibble === 0xc) return true;                         // the decoder's own air
  return false;                                            // diagonal, raised, wall: solid
}

/** MAP1: the one geometry-bearing layer. */
function decodeMap1(cell, inf, tables, mapType) {
  const id = cell.rawMap1;
  if (!id) return;

  const nibble = (id & 0xf000) >> 12;

  if (nibble === 0x8) {
    cell.kind = 'entity';
    cell.entityFlatIndex = id & 0x00ff;
    return;
  }

  if (nibble === 0x9) {
    // A transparent block textured once per side, with no back faces (arches).
    cell.kind = 'transparent';
    cell.sideTexture = voxelIndexOf(inf, (id & 0x00ff) - 1);
    cell.solid = (id & 0x0100) === 0;
    return;
  }

  if (nibble === 0xa) {
    // A single two-sided quad on one face: fences, gates, shop signs.
    cell.kind = 'edge';
    let textureId = (id & 0x003f) - 1;
    if (textureId < 0) textureId = 0;
    cell.sideTexture = voxelIndexOf(inf, textureId);
    const baseOffset = (id & 0x0e00) >> 9;
    const offsetUnits = mapType === 'interior' ? baseOffset * 8 : baseOffset * 32 - 8;
    cell.yOffset = offsetUnits / ARENA_UNITS;
    cell.ySize = 0;                                    // 0 = reaches the ceiling
    // The face is bits 6–7, so the value is 0…3 and indexes `EDGE_FACES` directly. It was
    // decoded as `(id & 0xC0) >> 4`, which yields 0/4/8/12, and only 0 is a face: the
    // mesher's `EDGE_FACES[cell.facing] ?? EDGE_FACES[0]` then drew **three of the four
    // orientations as north**. Measured on the real blocks — `EQBD9A.MIF`'s sign sits at
    // face 4 (east) — so a shop's sign hung on the wrong wall of its doorway.
    cell.facing = (id & 0x00c0) >> 6;
    cell.solid = (id & 0x0100) !== 0;
    return;
  }

  if (nibble === 0xb) {
    cell.kind = 'door';
    cell.doorKind = DOOR_KINDS[(id & 0x00c0) >> 4] ?? 'splitting';
    cell.sideTexture = voxelIndexOf(inf, (id & 0x003f) - 1);
    cell.solid = true;                                 // doors start shut; M4 animates them
    return;
  }

  if (nibble === 0xc) return;                          // undocumented — air

  if (nibble === 0xd) {
    cell.kind = 'diagonal';
    cell.sideTexture = voxelIndexOf(inf, (id & 0x00ff) - 1);
    cell.solid = true;
    cell.facing = (id & 0x0100) === 0 ? 0 : 1;         // 0 = right diagonal, 1 = left
    return;
  }

  if ((id & 0x8000) !== 0) return;                     // undocumented with 0x8000 set

  const most = (id & 0x7f00) >> 8;
  const least = id & 0x007f;
  if (most === least) {
    cell.kind = 'wall';
    cell.sideTexture = voxelIndexOf(inf, most - 1);
    cell.solid = true;
    return;
  }

  // A raised platform: the most-significant byte is `0x0tttthhh`.
  cell.kind = 'raised';
  const sideSlot = id & 0x000f;                        // *BOXSIDE slot
  const capSlot = (id & 0x00f0) >> 4;                  // *BOXCAP slot
  const heightIndex = most & 0x07;
  const thicknessIndex = (most & 0x78) >> 3;

  const baseOffset = tables.heights[heightIndex] ?? 0;
  let baseSize = tables.thicknesses[thicknessIndex] ?? 16;
  if (mapType === 'interior' && inf?.ceiling?.boxScale) {
    baseSize = (baseSize * inf.ceiling.boxScale) / 256;
  } else if (mapType === 'wilderness') {
    baseSize = (32 * (inf?.ceiling?.boxScale ?? 192)) / 256;
  }

  cell.yOffset = baseOffset / ARENA_UNITS;
  cell.ySize = baseSize / ARENA_UNITS;
  cell.sideTexture = voxelIndexOf(inf, inf?.boxSides?.[sideSlot] ?? null);
  cell.capTexture = voxelIndexOf(inf, inf?.boxCaps?.[capSlot] ?? null);
  cell.bottomTexture = voxelIndexOf(inf, inf?.ceiling?.textureIndex ?? null);
  cell.solid = true;
}

/**
 * Is this cell a **stairway**, and which way does it go?
 *
 * The `.INF` says which of its own voxel textures means "up" and which means "down"
 * (`@WALLS`'s `*LEVELUP`/`*LEVELDOWN` directives, parsed as `levelUpIndex`/`levelDownIndex`),
 * and the map data then uses those textures at the stairways — so a stair is a **wall cell
 * whose side texture is the INF's own stair art**, and reading it off the texture is the
 * original's own rule.
 *
 * Measured over the install, that is exactly what the cells are: `NOBLE1`'s upper floor
 * carries `CASU.IMG` at (9,1) and its ground floor `CASD.IMG` where it comes back down,
 * `TAVERN1` `ISUP.IMG` at (7,1) and `ISDN.IMG` below it, `BS1` and `MAGE1` the same pair,
 * and the Halls of Colossus `STAIRUP.IMG`/`STAIRDWN.IMG` — **at the same cell in the two
 * levels it joins** (level 0 has seven `STAIRDWN` cells at exactly the cells level 1 has
 * seven `STAIRUP` ones). The last level's own up-stair leads out of the building or out of
 * the dungeon, which is why `START.MIF`'s single stair is `GATE.IMG` — the Imperial
 * Dungeons' way out to the world — and why the cities' own `*LEVELUP` art is a gate.
 *
 * `down` is the higher level index and `up` the lower one: a file's levels are stored
 * top-down and its `startingLevelIndex` is the **ground floor** (`NOBLE1` starts on its
 * third level, 2, and its stair at index 2 is an up one).
 *
 * @param {LevelVoxel} cell
 * @param {import('../arena/infFile.js').InfFile|null} inf
 * @returns {'up'|'down'|null}
 */
export function stairKindOf(cell, inf) {
  if (cell.kind !== 'wall' || cell.sideTexture < 0 || !inf) return null;
  if (inf.levelUpIndex !== null && cell.sideTexture === inf.levelUpIndex) return 'up';
  if (inf.levelDownIndex !== null && cell.sideTexture === inf.levelDownIndex) return 'down';
  return null;
}

/** MAP2: whether there is a ceiling over this cell, and its texture. */
function decodeMap2(cell, inf, hasMap2) {
  if (!hasMap2) {
    // Without MAP2 the INF's ceiling covers the whole level, unless the INF says
    // this is an outdoor dungeon.
    if (inf && !inf.ceiling.outdoorDungeon) {
      // The INF's own ceiling texture, or **voxel texture 0** when its `@FLOORS`
      // section has no `*CEILING` line at all — which is the case in `START.INF`, the
      // Imperial Dungeons. That file left every ceiling quad without a material and
      // the mesher's `group(null)` dropped all 2 500 of them, so the game opened onto
      // a black void instead of a ceiling. OpenTESArena's ceiling builder does exactly
      // this fallback (`MapGeneration.cpp`: `ceiling.textureIndex.value_or(0)`), and
      // one texture later in this same install — `HALLS1.INF` — sets index 0 too.
      cell.ceiling = true;
      cell.ceilingTexture = voxelIndexOf(inf, inf.ceiling.textureIndex ?? 0);
    }
    return;
  }
  if (!cell.rawMap2) return;
  cell.ceiling = true;
  cell.ceilingTexture = voxelIndexOf(inf, (cell.rawMap2 & 0x007f) - 1);
  // ── THE STOREYS ABOVE ─────────────────────────────────────────────────────
  //
  // MAP2 is not only "there is a lid here": its voxel carries a **height class**
  // (`map2HeightClass`, OpenTESArena's `ArenaLevelUtils::getMap2VoxelHeight`), which is
  // how many voxel layers of solid mass this cell holds above the playable layer. In a
  // city that mass *is the building*: a `BSBD*`/`NBBD*`/`EQBD*` block's ground floor is
  // in MAP1 and its upper floors and tower are in MAP2, one to three layers thick. The
  // measurement is unambiguous — of the install's 368 block `.MIF`s, **356 carry mass
  // taller than one layer**, 13 292 voxels of class 2 and 1 624 of class 3
  // (`tools/tmp-map2.mjs`). A decoder that reads MAP2 only as "ceiling yes/no" throws
  // exactly that away, which is why every city building came out one storey tall with a
  // flat lid on it however much mass the data put above it.
  //
  // The voxel's own texture is the mass's own texture (the same `(id & 0x7F) - 1` the
  // ceiling uses), so a storey is drawn with the art the block asked for.
  // **The nibble is not a kind.** MAP2 has no entity/door/fence nibbles the way MAP1 does:
  // its `(id & 0x3F)` is an INF texture index, so bits 12–13 are part of the *texture* and
  // a guard that read them as a kind threw every real block away (measured: `0x2B2B` failed
  // `(id & 0xF000) === 0`, so all 368 blocks decoded to zero storeys). What separates the
  // two forms is the one thing MAP2 does encode: a plain mass has `most === least`, and a
  // raised box's two bytes are a `*BOXSIDE`/`*BOXCAP` slot pair.
  cell.upperLayers = map2HeightClass(cell.rawMap2);
  cell.upperRaised = ((cell.rawMap2 & 0x7f00) >> 8) !== (cell.rawMap2 & 0x7f);
}

/**
 * Resolve a texture ID to an index into `inf.voxelTextures`, wrapping modulo 64
 * like `ArenaVoxelUtils::clampVoxelTextureID`, or -1 when the INF has no slot at
 * all so the mesher can fall back visibly rather than silently.
 *
 * @param {import('../arena/infFile.js').InfFile} inf
 * @param {number|null|undefined} id
 * @returns {number}
 */
function voxelIndexOf(inf, id) {
  if (id === null || id === undefined) return -1;
  const n = inf?.voxelTextures?.length ?? 0;
  if (!n) return -1;
  let i = id;
  if (i >= 64) i %= 64;
  if (i < 0) return -1;
  return i < n ? i : 0;
}

/**
 * Pick a spawn: the `.MIF` start point when it is standable, otherwise the first
 * non-solid cell found spiralling out from the centre.
 *
 * @param {LevelVoxel[]} cells
 * @param {number} width
 * @param {number} depth
 * @param {{x:number,z:number}[]} startPoints
 * @param {number} floorY
 * @returns {{x:number,y:number,z:number}|null}
 */
function pickSpawn(cells, width, depth, startPoints, floorY) {
  const usable = (row, col) => {
    if (row < 0 || col < 0 || row >= depth || col >= width) return false;
    const cell = cells[row * width + col];
    return cell && !cell.solid && !cell.floor.chasm;
  };

  for (const point of startPoints) {
    if (!point.x && !point.z) continue;
    const row = Math.floor(point.x);
    const col = Math.floor(point.z);
    if (usable(row, col)) return { x: row + 0.5, y: floorY, z: col + 0.5 };
  }

  const cx = Math.floor(depth / 2);
  const cz = Math.floor(width / 2);
  for (let r = 0; r < Math.max(width, depth); r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (usable(cx + dx, cz + dz)) return { x: cx + dx + 0.5, y: floorY, z: cz + dz + 0.5 };
      }
    }
  }
  return null;
}

/**
 * The INF texture reference a cell draws one of its faces with.
 *
 * @param {LevelVoxel} cell
 * @param {'floor'|'side'|'cap'|'bottom'|'ceiling'} face
 * @param {import('../arena/infFile.js').InfFile} inf
 * @returns {import('../arena/infFile.js').InfVoxelTexture|null}
 */
export function cellTexture(cell, face, inf) {
  const index = face === 'floor' ? cell.floor.texture
    : face === 'side' ? cell.sideTexture
    : face === 'cap' ? cell.capTexture
    : face === 'bottom' ? cell.bottomTexture
    : cell.ceilingTexture;
  if (index === null || index === undefined || index < 0) return null;
  return voxelTexture(index, inf);
}
