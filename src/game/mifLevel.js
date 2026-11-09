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

  // **The level's own canvas, and the margin around it.** A `.MIF` declares one grid for the
  // whole file in its header, and a level may use less of it than that: `42110737.MIF` is 96×80,
  // and the Fortress of Ice's **second storey writes nothing at all** outside its north-west
  // 64×58 — 3 968 cells of the grid, one in two, that carry no floor, no wall and no storey.
  // They decode as open air with floor texture `0`, so the flood that picks a level's deepest
  // chamber walked straight through them and put the map that names Labyrinthian's piece **in
  // that margin** — the owner's *"the map to the piece in Labyrinthian in the Fortress of Ice
  // second floor is in an non accessible place because the second floor of the dungeon is bigger
  // than what it should be and has an non accessible part"*. Every cell outside the canvas is
  // marked `void`, which the automap already had a word for, and which the objective walk, the
  // arrival and the sheet all read through `isVoidCell`.
  const canvas = levelCanvas(level, width, depth);
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const cell = cells[row * width + col];
      cell.void = Boolean(canvas)
        && (row < canvas.row0 || row > canvas.row1 || col < canvas.col0 || col > canvas.col1);
    }
  }

  const spawn = pickSpawn(cells, width, depth, startPoints, floorY);

  return {
    width, depth, ceilingScale, layerCount, floorY, ceilingY,
    outdoors: hasMap2 ? stats.ceilinged === 0 : Boolean(inf?.ceiling?.outdoorDungeon),
    inf, cells, startPoints, spawn, stats, canvas,
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
    // Set by `decodeLevel` once it knows the level's canvas (`levelCanvas`).
    void: false,
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
/**
 * OPEN A SETTLEMENT'S GATE: the wall's own opening is a **way through**, not a wall.
 *
 * The owner, playing beside the original: *"CITY GATES SHOULD HAVE NO COLLISION SO I CAN ACTUALLY
 * GO INTO THE WILDERNESS"*. He is right about the original and the port was wrong: every shipped
 * city skeleton cuts **exactly one** opening in its outermost line and hangs the game's gateway art
 * in it — a `0x9` **transparent** voxel, drawn as `PGATE.IMG` — and `decodeMap1` gave that voxel
 * `solid` from its own byte, so a player who walked at the gate stopped against the art and the
 * country was reachable only through `scenes/interior.js`'s push rule (D-27). A gate you have to
 * fight is not a gate.
 *
 * So the opening cells are marked **`gateway: true`**, which says *drawn as always, collides with
 * nobody*: `mifMesh.js` reads the flag when it decides what goes into the collision soup, and the
 * scene's own walkability test reads it too. Nothing is moved, hidden or re-textured — the wall, the
 * gate's leaves and the street behind it are all exactly what the file says.
 *
 * The rule is the outermost line and nothing else, which is what makes it narrow: a `0x9` **arch
 * inside** a city (a garden gate, a hedge) is not on the line and is left alone, and the opening must
 * stand over walkable ground on the settlement's own inside, so a hole into nothing is not a gate.
 * Measured on the shipped skeletons: `CITY1` row 0 cols 18–19, `TOWN1` col 0 rows 26–27, `VILLAGE1`
 * row 86 cols 79–80, `CITYW2` col 127 rows 8–9.
 *
 * **A line with more than one opening is not a settlement** and is refused whole, which is the
 * guard this function needs because it is *also* handed building files: a city block's own `.MIF`
 * carries `0x9` arches along its line too (they are its shopfronts, and street lies behind them),
 * and opening *those* would punch holes in a facade. Swept over all 526 `.MIF` records in the
 * archive: the twenty settlement skeletons each cut **exactly one** run of exactly two cells
 * (`CITY1…5`, `CITYW1…3`, `TOWN1…5`, `TOWNW1…2`, `VILLAGE1…5`), while the blocks that carry any
 * opening at all
 * show one **wide** run (`NBBD6A`: fourteen cells) or **two** runs on different lines (`TSBD7A`: three
 * on row 0 and three on col 0) — so the single-run reading separates them without a filename test.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level  a **decoded** level (`decodeLevel`)
 * @returns {{row: number, col: number, axis: 'north'|'south'|'east'|'west'}[]} the cells opened
 */
export function openSettlementGate(level) {
  const cells = level?.cells;
  if (!cells?.length) return [];
  const { width, depth } = level;
  const at = (row, col) => (row < 0 || col < 0 || row >= depth || col >= width ? null : cells[row * width + col]);
  /**
   * The settlement's own street: the ground the opening has to stand over — the **same** test the
   * scene's `walkableWorld` makes (`!cell.solid && !cell.floor?.chasm`), so a body that can stand
   * behind the gate is exactly what makes it a gate. `CITY4`'s opening stands over an `0x8` floor
   * *entity* (art on the ground, not a wall — `rawPassable` says the same), which an earlier version
   * of this test excluded; the city was then left with no gate at all.
   */
  const street = (cell) => Boolean(cell) && !cell.solid && !cell.floor?.chasm;

  const line = [];
  for (let col = 0; col < width; col++) {
    line.push({ row: 0, col, axis: 'north', dr: 1, dc: 0 });
    line.push({ row: depth - 1, col, axis: 'south', dr: -1, dc: 0 });
  }
  for (let row = 1; row < depth - 1; row++) {
    line.push({ row, col: 0, axis: 'west', dr: 0, dc: 1 });
    line.push({ row, col: width - 1, axis: 'east', dr: 0, dc: -1 });
  }

  // Collect first and mark nothing yet: the whole line has to be read before it can be judged.
  const candidates = [];
  for (const spot of line) {
    const cell = at(spot.row, spot.col);
    if (!cell || cell.gateway) continue;
    // The gateway voxel is the transparent one — `0x9`, the same reading `decodeMap1` takes and the
    // same one `scenes/interior.js` reads a settlement's gate with.
    if (((cell.rawMap1 & 0xf000) >> 12) !== 0x9) continue;
    if (!street(at(spot.row + spot.dr, spot.col + spot.dc))) continue;
    candidates.push(spot);
  }

  // **One opening, or none at all.** A settlement cuts a single run; a building's line carries a
  // long run of arches or a run on each of two lines, and neither is a gate.
  const runs = [];
  for (const spot of candidates) {
    const run = runs[runs.length - 1];
    const along = spot.axis === 'north' || spot.axis === 'south' ? spot.col : spot.row;
    const same = run && run[0].axis === spot.axis && along === run[run.length - 1].along + 1;
    if (same) { run.push({ ...spot, along }); continue; }
    runs.push([{ ...spot, along }]);
  }
  if (runs.length !== 1 || runs[0].length !== 2) return [];

  for (const spot of runs[0]) {
    const cell = at(spot.row, spot.col);
    cell.gateway = true;
  }
  // **Every wall the gate art is painted on is a gate, not just the two-cell opening.** The
  // owner, 2026-10-19: *"all walls that use the sprites AR-sprite-DGATE AR-sprite-MGATE
  // AR-sprite-PGATE should have no collision because they are barring the way in and out of
  // cities"*. The opening is the `0x9` arch; the gate's illustrated posts stand one cell behind
  // it and are ordinary solid voxels wearing `PGATE.IMG` (measured on `CITY1`: row 0 cols 18–19
  // open, row 2 cols 18–19 painted `PGATE.IMG`). Those posts used to remain in the collision
  // soup, which is the wall a player walked into after passing the arch. They are marked here
  // too: drawn exactly as before, colliding with nobody.
  const gateArtCells = [];
  const gateArt = (cell) => ['side', 'cap'].some((face) => {
    const name = cellTexture(cell, face, level.inf)?.filename ?? '';
    return /^(D|M|P)GATE\.IMG$/i.test(name);
  });
  for (const cell of cells) {
    if (!cell || cell.gateway || cell.kind === 'air' || cell.kind === 'entity') continue;
    if (!gateArt(cell)) continue;
    cell.gateway = true;
    gateArtCells.push({ row: cell.z, col: cell.x });
  }
  level.gateArtCells = gateArtCells;

  // **Every door the wall draws is a door.** The owner, 2026-10-22: *"in both pc and phone you
  // should be able to use all door textures on the citywalls of villages and town to get in and
  // out of said towns not just the main gate"*. A settlement's wall line is not one opening and
  // a length of blank wall: it is painted with the gate's own **door pictures** as well —
  // `T_DLGT.IMG` and `T_DRGT.IMG`, the two leaves of a gate, in pairs along the ring (measured
  // off the skeletons: `CITY1` (0,58)-(0,59), `VILLAGE1` (0,6)-(0,7), (86,39)-(86,40),
  // (0,77)-(0,78)). They were solid collision wearing a picture of a door, so a player could see
  // four ways into a village and take only the one the arch happened to be in. A door picture on
  // the outer line, standing over street, is a gate now: drawn exactly as before, walked through,
  // and answered by `E` like the main one (the scene's `gateAtPlayer` reads this list).
  const gateList = runs[0].map(({ row, col, axis }) => ({ row, col, axis }));
  const doorArt = (cell) => ['side', 'cap'].some((face) => {
    const name = cellTexture(cell, face, level.inf)?.filename ?? '';
    return /^(?:T_)?D(?:L|R)GT\.IMG$/i.test(name) || /DOOR\.IMG$/i.test(name);
  });
  for (const spot of line) {
    const cell = at(spot.row, spot.col);
    if (!cell || cell.gateway) continue;
    if (!doorArt(cell)) continue;
    // The same law the arch is held to: a door that opens onto nothing is a painting.
    if (!street(at(spot.row + spot.dr, spot.col + spot.dc))) continue;
    cell.gateway = true;
    gateList.push({ row: spot.row, col: spot.col, axis: spot.axis });
  }
  return gateList;
}

/**
 * Could a player stand in this cell, read off the **raw** voxels alone?
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

/**
 * **The missing half of a stairway** — the down stair on the floor above.
 *
 * A stairway in Arena is one cell drawn in **both** levels it joins, and the reference says so
 * in the way it reads an interior: `tryMakeVoxelTransitionDefGenInfo` asks each *level's own*
 * `.INF` whether a texture is `*LEVELUP`/`*LEVELDOWN`, so each end of the pair has its own art.
 * Several of this install's multi-storey interiors carry only **one** end: the upper floor is
 * missing the down stair that would reach the lower one. Measured over every interior `.MIF`
 * with more than one level: the crypts (`WCRYPT1…8`) are the plainest case — **level 0, the
 * entrance, has no stair at all**, while level 1 carries one `*LEVELUP` cell, which points at
 * level 0. The palaces (`PALACE1…5`, `TOWNPAL1…3`, `VILPAL1…3`) have the same shape, and so do
 * the taverns 2/3/4/5/7/8, the temples, the Mages Guild halls and the equipment stores (those
 * last are single-storey rooms in a two-level file, and their second level is unused).
 *
 * This fills the pair **from the data's own half**: where the level below carries an `*LEVELUP`
 * cell, the same cell in this level becomes an `*LEVELDOWN` stair with this level's own art —
 * but only when the cell is already a **wall** there and is not a stair of its own. Nothing is
 * moved and nothing is invented: the position is the lower level's, the art is this level's
 * `.INF`'s, and the pair is exactly the one the file draws.
 *
 * @param {object} opts
 * @param {Uint16Array} opts.map1            this (upper) level's raw `MAP1`
 * @param {import('../arena/infFile.js').InfFile} opts.inf  this level's `.INF`
 * @param {Uint16Array} opts.belowMap1       the level below's raw `MAP1`
 * @param {number} opts.width                the level's width in cells
 * @param {import('../arena/infFile.js').InfFile} opts.belowInf  the level below's `.INF`
 * @returns {{map1: Uint16Array, at: {row: number, col: number}[]}|null} a new `MAP1` and the
 *   cells filled, or null when the pair is already whole or cannot be completed
 */
export function fillStairPair({ map1, inf, belowMap1, belowInf, width }) {
  if (!map1?.length || !belowMap1?.length || !inf || !belowInf || !width) return null;
  const down = inf.levelDownIndex;
  const up = belowInf.levelUpIndex;
  if (!Number.isInteger(down) || down < 0 || !Number.isInteger(up) || up < 0) return null;
  const stairUp = ((up + 1) << 8) | (up + 1);
  const stairDown = ((down + 1) << 8) | (down + 1);
  // **A floor that already descends is not touched.** A tower, a noble house and a shop with a
  // real pair carry their own down stair — possibly at another cell than the one the floor below
  // draws — and adding a second one would give the level two ways into the same storey. The rule
  // is for the **missing** half, never for a second one.
  for (let i = 0; i < map1.length; i++) if (map1[i] === stairDown) return null;
  const usable = (i) => {
    const voxel = map1[i];
    if (!voxel || (voxel >> 8) !== (voxel & 0xff)) return false;   // not a wall
    const texture = (voxel >> 8) - 1;
    return texture !== down && texture !== inf.levelUpIndex;        // not already a stair
  };
  let out = null;
  const at = [];
  for (let i = 0; i < belowMap1.length; i++) {
    if (belowMap1[i] !== stairUp) continue;
    const row = Math.floor(i / width);
    const col = i % width;
    // **The same cell first** — that is the reference's own pair. Where the upper level has no
    // wall there at all (the crypts: the lower level's `*LEVELUP` cell is open air above), the
    // nearest wall of its four neighbours takes the stair, so the two ends stay within one cell
    // of each other and a player at the bottom comes up beside where they went down.
    // Distance 1 first (the pair's own cell and its cross), then distance 2 — a crypt's lower
    // stair can sit two cells from any wall of the floor above it (`WCRYPT1` does), and the
    // alternative is a storey no player can ever reach.
    const ring = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) ring.push([row + dr, col + dc]);
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) ring.push([row + dr, col + dc]);
    const neighbours = ring
      .filter(([r, c]) => r >= 0 && c >= 0 && c < width && r * width + c < map1.length)
      .map(([r, c]) => r * width + c);
    const candidates = neighbours.filter((cell) => usable(cell));
    const cell = candidates[0];
    if (cell === undefined) continue;
    out ??= Uint16Array.from(map1);
    out[cell] = stairDown;
    at.push({ row: Math.floor(cell / width), col: cell % width, from: { row, col } });
  }
  return out ? { map1: out, at } : null;
}

/**
 * **The cell a player stands in at the level's own way out** — beside the level's up-stair.
 *
 * The owner, 2026-10-17: *"move the exit from the imperial prison target really where the exit
 * is"*. The escape stage's target was the same as every other stage's — the deepest reachable
 * chamber — and the Imperial Dungeons' exit is not a chamber at all: `START.MIF` carries
 * **exactly one** stair (`GATE.IMG` at x 48, z 46 — the art `stairKindOf` above reads as the way
 * out to the world, and its neighbour at x 47, z 46 is the corridor the player walks) and the
 * deepest cell of a 50×50 maze can sit at the far end of it, which sent the player hunting for a
 * room when the door was in the wall beside them.
 *
 * A stair cell is **solid** — that is why a player can never stand in one — so the answer is
 * one of its four neighbours: the first the player can stand in, in a fixed order (south,
 * north, east, west) so the same level always answers the same cell. A generated level's way
 * out is stamped into a wall beside its arrival instead (`dungeonPlan.js`'s `level.exit`, raw
 * `row`/`col`, which is this grid's `x`/`z`), and that is answered the same way.
 *
 * @param {import('./mifLevel.js').ArenaLevel|object} level
 * @returns {{x: number, z: number, stair: {x: number, z: number}}|null} in cells, or null when the
 *   level marks no way out (or marks one with no room to stand at)
 */
export function wayOutCell(level) {
  const width = Number(level?.width);
  const depth = Number(level?.depth);
  if (!level?.cells?.length || !(width > 0) || !(depth > 0)) return null;
  // **The grid's own convention, not the cell's two fields.** This module's `makeCell(col, row)`
  // names a cell's **column** `x` and its **row** `z`, which is the reverse of the world: the
  // mesher puts `row` on world x and `col` on world z (`mifMesh.js`, `x0 = row * S, z0 = col * S`),
  // and every reader that walks the grid — `deepestCells`, the scene's own stair search, `flats.js`
  // (`row: cell.z, col: cell.x`, the same swap written down) — works in that world reading. So a
  // cell's world coordinates are its **array position**: x = the first index, z = the second, and
  // the lookup is `cells[x * width + z]`. Reading `cell.x`/`cell.z` here transposed the map, and
  // on a square, wall-boundary level (`START.MIF`) the transposed neighbour of the `GATE.IMG`
  // stair at x 48, z 46 is solid, so the escape's own way out answered `null` and the objective
  // fell back to the deepest chamber — exactly the bug this function exists to remove.
  const at = (x, z) => (x >= 0 && z >= 0 && x < depth && z < width ? level.cells[x * width + z] : null);
  const standable = (cell) => Boolean(cell) && !cell.solid && !cell.floor?.chasm;
  /** @type {{x: number, z: number}[]} */
  const stairs = [];
  for (let i = 0; i < level.cells.length; i++) {
    const cell = level.cells[i];
    if (cell?.stair !== 'up') continue;
    stairs.push({ x: Math.floor(i / width), z: i % width });
  }
  // A generated level's stamped exit (`dungeonPlan.js`'s `level.exit`) is already raw `row`/`col`,
  // and raw `row` is the first index — the same world reading, so it needs no conversion.
  if (Number.isFinite(level.exit?.row) && Number.isFinite(level.exit?.col)) {
    stairs.push({ x: level.exit.row, z: level.exit.col });
  }
  for (const stair of stairs) {
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (!standable(at(stair.x + dx, stair.z + dz))) continue;
      return { x: stair.x + dx, z: stair.z + dz, stair: { x: stair.x, z: stair.z } };
    }
  }
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
 * Pick a spawn: the `.MIF` start point when it is standable **and leads somewhere**,
 * otherwise the middle of the level's largest reachable region.
 *
 * **"and leads somewhere" is the important half.** Arena keeps its start points in the
 * `.MIF` **header, one set per file rather than per level** (`decodeLevel`'s own note), so
 * the point is the *ground floor's* arrival and every level below it is handed the same
 * two numbers. Measured over the install's sixteen quest dungeons, that lands a player in a
 * sealed pocket on more than one level: `40642738.MIF` (Selene's Web) level 2 arrives in a
 * region of **25 cells out of 2 483** walkable ones — the reported *"you find yourself
 * blocked off as soon as you enter"*, one level down. The header point is still preferred
 * when it is in the **largest** region (it is the file's own answer to where a player comes
 * in), and the level's own middle is the fallback rather than the first non-solid cell found
 * spiralling out from it: a spiral can start inside a closed room and stop there.
 *
 * Reachability is the flood `deepestCells` and `openSettlementGate` already use — a wall is
 * the only thing a player cannot cross (doors open, chasms are jumped, raised platforms are
 * stepped onto) — so the arrival and the objective agree about the level they are standing in.
 *
 * @param {LevelVoxel[]} cells
 * @param {number} width
 * @param {number} depth
 * @param {{x:number,z:number}[]} startPoints
 * @param {number} floorY
 * @returns {{x:number,y:number,z:number}|null}
 */
function pickSpawn(cells, width, depth, startPoints, floorY) {
  // **A body arrives on the level's own floor, never in the margin the grid leaves around it**
  // (`isVoidCell`). Measured over the install's sixteen numbered dungeon maps, five levels of
  // them would otherwise hold their "largest region" in that margin — `40516921.MIF` (Murkwood)
  // level 1 is 14 566 margin cells against a much smaller maze — and a player handed one of them
  // as the arrival stood in the empty hall beside the dungeon rather than in it.
  const usable = (row, col) => {
    if (row < 0 || col < 0 || row >= depth || col >= width) return false;
    const cell = cells[row * width + col];
    return cell && !cell.solid && !cell.floor.chasm && !isVoidCell(cell);
  };
  const crossable = (row, col) => row >= 0 && col >= 0 && row < depth && col < width
    && cells[row * width + col]?.kind !== 'wall' && !isVoidCell(cells[row * width + col]);

  // ── the level's own regions ─────────────────────────────────────────────────
  // One flood per region, each cell visited once, so this is linear in the level's size: the
  // largest region, and a set of the cells inside it, which is what tells a header point
  // whether it arrives somewhere (see the doc above).
  const component = new Int32Array(width * depth).fill(-1);
  let largest = { id: -1, size: 0, row: 0, col: 0 };
  let id = 0;
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const start = row * width + col;
      if (component[start] !== -1 || !crossable(row, col)) continue;
      const queue = [{ row, col }];
      component[start] = id;
      for (let head = 0; head < queue.length; head++) {
        const here = queue[head];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const r = here.row + dr;
          const c = here.col + dc;
          if (!crossable(r, c) || component[r * width + c] !== -1) continue;
          component[r * width + c] = id;
          queue.push({ row: r, col: c });
        }
      }
      // The region's own middle: the cell nearest the level's arithmetic centre, restricted to
      // cells a body actually fits in (`usable`: no wall, not a chasm).
      let best = null;
      const cx = (depth - 1) / 2;
      const cz = (width - 1) / 2;
      for (const spot of queue) {
        if (!usable(spot.row, spot.col)) continue;
        const distance = Math.abs(spot.row - cx) + Math.abs(spot.col - cz);
        if (!best || distance < best.distance) best = { ...spot, distance };
      }
      if (best && queue.length > largest.size) largest = { id, size: queue.length, row: best.row, col: best.col };
      id++;
    }
  }

  for (const point of startPoints) {
    if (!point.x && !point.z) continue;
    const row = Math.floor(point.x);
    const col = Math.floor(point.z);
    if (!usable(row, col)) continue;
    // The header point arrives in the level's own largest region, or it is not the arrival here.
    if (largest.id < 0 || component[row * width + col] === largest.id) return { x: row + 0.5, y: floorY, z: col + 0.5 };
  }

  if (largest.size > 0) return { x: largest.row + 0.5, y: floorY, z: largest.col + 0.5 };
  return null;
}

/**
 * **The rectangle of a level's grid that the file actually wrote into.**
 *
 * A `.MIF` header declares one grid for every level in the file, and a level may fill less of it:
 * the Fortress of Ice's second storey writes nothing outside rows 0–57 × columns 0–63 of its 80×96
 * grid. That margin is not part of the level — it has no floor of its own, no wall, no storey —
 * and this is the smallest box that holds everything the level does carry.
 *
 * Read off the **raw layers** rather than the decoded cells, so it does not depend on how a voxel
 * is classified, and `null` when the level carries nothing at all (which no shipped level does).
 *
 * @param {{flor?: ArrayLike<number>|null, map1?: ArrayLike<number>|null, map2?: ArrayLike<number>|null}} level
 * @param {number} width @param {number} depth
 * @returns {{row0:number, row1:number, col0:number, col1:number}|null}
 */
export function levelCanvas(level, width, depth) {
  let row0 = depth, row1 = -1, col0 = width, col1 = -1;
  for (let i = 0; i < width * depth; i++) {
    const flor = level.flor ? level.flor[i] : 0;
    const map1 = level.map1 ? level.map1[i] : 0;
    const map2 = level.map2 ? level.map2[i] : 0;
    if (!flor && !map1 && !map2) continue;
    const row = Math.floor(i / width);
    const col = i % width;
    if (row < row0) row0 = row;
    if (row > row1) row1 = row;
    if (col < col0) col0 = col;
    if (col > col1) col1 = col;
  }
  return row1 < row0 ? null : { row0, row1, col0, col1 };
}

/**
 * **Is this cell outside the level's own canvas?**
 *
 * The margin `levelCanvas` describes is not a room, so nothing may be placed in it and no walk
 * reaches through it: the objective's flood (`scenes/interior.js`'s `deepestCells`), the arrival
 * (`pickSpawn`) and the automap's sheet all read this one fact. Measured over the install's 16
 * numbered dungeon maps, **one** of their 39 levels has such a margin — the Fortress of Ice's
 * second storey, 3 968 of its 7 680 cells — and it is the level whose map-to-the-piece the owner
 * reported as unreachable.
 *
 * A cell built by hand — a test fixture, a block from `dungeonPlan` before it is decoded — has no
 * `void` flag, and falls back to the automap's older reading of the same idea: no floor of its
 * own and nothing solid standing over it.
 *
 * @param {LevelVoxel|null|undefined} cell
 * @returns {boolean}
 */
export function isVoidCell(cell) {
  if (!cell) return false;
  if (typeof cell.void === 'boolean') return cell.void;
  return !cell.rawFlor && !cell.solid;
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
