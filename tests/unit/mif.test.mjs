// MILESTONE 3 UNIT TESTS — every assertion below runs against the *real* Arena
// files, not synthetic ones, because the whole point of this milestone is that
// the reverse-engineered formats are correct.
//
//   node --test tests/unit/
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/
//
// Nothing here boots a renderer; the browser suite (`tests/run-browser.mjs`)
// covers what actually reaches the screen.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import { decodeType08 } from '../../src/arena/decompress.js';
import { decryptInf, parseInfText } from '../../src/arena/infFile.js';
import { parseImg } from '../../src/arena/image.js';
import { cellTexture, decodeLevel, fillStairPair, openSettlementGate, wayOutCell } from '../../src/game/mifLevel.js';
import { ARENA_TEXTURE_ARCHIVE, CELL_SIZE, CHASM_DEPTH, CHASM_DEPTHS, chasmDepthOf, buildLevelMesh } from '../../src/game/mifMesh.js';
import { CLIMB_LEDGE_MAX, STEP_OFFSET } from '../../src/engine/player/motor.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { Collider } from '../../src/engine/player/collider.js';
import { identity } from '../../src/engine/world/mat4.js';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

test('GLOBAL.BSA directory covers the file exactly', async () => {
  const archive = await data.bsa();
  assert.ok(archive.count > 2000, `expected thousands of records, got ${archive.count}`);
  // The directory starts exactly where the last payload ends: no padding, no
  // per-record compression. This is the single strongest check on the reader.
  assert.equal(archive.payloadEnd, archive.directoryStart);
  const names = archive.names();
  assert.ok(names.includes('ARABCITY.XFM'), 'ARABCITY.XFM should be in the archive');
  assert.ok(names.includes('CAS.INF'), 'CAS.INF should be in the archive');
  assert.equal(new Set(names).size, names.length, 'record names must be unique');
  // The census is what the survey documented (FORMATS.md §2).
  const census = archive.census();
  assert.ok(census.IMG > 800, `IMG count ${census.IMG}`);
  assert.ok(census.MIF > 400, `MIF count ${census.MIF}`);
  assert.ok(census.SET > 100, `SET count ${census.SET}`);
});

test('MIF header framing and level count are self-consistent', async () => {
  const mif = await data.mif('IMPPAL.MIF');
  assert.ok(mif.width > 0 && mif.height > 0);
  assert.equal(mif.levelCount, mif.declaredLevelCount, 'parsed levels must match the declared count');
  assert.ok(mif.levels.length >= 1);
  // Every level names the .INF that defines it.
  for (const level of mif.levels) assert.match(level.info, /\.inf$/i);
});

test('every MIF in the game folder parses and decodes', async () => {
  const source = nodeSource(ARENA_PATH);
  const names = source.list().filter((n) => n.endsWith('.MIF'));
  assert.ok(names.length >= 10, `expected the loose .MIF set, saw ${names.length}`);
  let levels = 0;
  for (const name of names) {
    const mif = await data.mif(name);
    assert.equal(mif.levelCount, mif.declaredLevelCount, `${name}: level count`);
    for (const level of mif.levels) {
      const inf = await data.inf(level.info.toUpperCase());
      const decoded = decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
      assert.equal(decoded.cells.length, mif.width * mif.height, `${name}: cell count`);
      assert.ok(decoded.spawn, `${name}: a spawn point must be found`);
      // A dungeon with no walls at all would mean the bitfields are misread.
      assert.ok(decoded.stats.wall > 0, `${name}: level ${level.name} has no walls`);
      levels++;
    }
  }
  assert.ok(levels >= 15, `expected to decode many levels, got ${levels}`);
});

test('oversized voxel layers are read for the map size, with a warning', async () => {
  // VILPAL3.MIF's second level is a stub: a 25×25 map holding a 100×100 grid.
  const mif = await data.mif('VILPAL3.MIF');
  assert.equal(mif.width, 25);
  assert.equal(mif.levelCount, 2);
  assert.equal(mif.levels[1].warnings.length > 0, true, 'the stub level must be flagged');
  assert.match(mif.levels[1].warnings[0], /layer holds 20000 B/);
  // It still decodes to a 25×25 grid rather than throwing.
  const inf = await data.inf(mif.levels[1].info.toUpperCase());
  const decoded = decodeLevel(mif.levels[1], inf, { width: 25, depth: 25, mapType: 'interior' });
  assert.equal(decoded.cells.length, 625);
  assert.equal(mif.levels[0].warnings.length, 0, 'an ordinary level must not warn');
});

test('MIF level order is physical, not sorted by name', async () => {
  // BS5.MIF physically lists level3, level2, level1 and starts at index 2.
  const mif = await data.mif('BS5.MIF');
  assert.deepEqual(mif.levels.map((l) => l.name), ['level3', 'level2', 'level1']);
  assert.equal(mif.startingLevelIndex, 2);
  assert.equal(mif.levels[mif.startingLevelIndex].name, 'level1');
});

test('Type08 decompression hits its stated output size exactly', async () => {
  const mif = await data.mif('START.MIF');
  const level = mif.levels[0];
  // decodeType08 is what produced these; re-run one known vector by hand.
  const raw = await data.must('START.MIF');
  const at = indexOfTag(raw, 'MAP1');
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const compressedSize = view.getUint16(at + 4, true);
  const uncompressedSize = view.getUint16(at + 6, true);
  assert.equal(uncompressedSize, mif.width * mif.height * 2);
  const out = decodeType08(raw.subarray(at + 8, at + 6 + compressedSize), uncompressedSize);
  assert.equal(out.length, uncompressedSize);
  // The parsed layer must be that same data.
  assert.deepEqual(Array.from(out.subarray(0, 16)), Array.from(new Uint8Array(level.map1.buffer, 0, 16)));
});

test('INF decryption turns an archive record into @FLOORS text', async () => {
  const archive = await data.bsa();
  const enc = archive.get('CAS.INF');
  assert.ok(enc, 'CAS.INF should live in the archive');
  assert.notEqual(enc[0], 0x40, 'the archive copy must be encrypted');
  const decrypted = decryptInf(enc);
  const text = Buffer.from(decrypted).toString('latin1');
  assert.match(text.replace(/\r/g, ''), /^@(FLOORS|WALLS|FLATS)/m);
});

test('INF parsing resolves BOXSIDE/BOXCAP slots to real textures', async () => {
  const inf = await data.inf('IMPPAL1.INF');
  assert.ok(inf.voxelTextures.length > 20, `IMPPAL1.INF should list many textures, got ${inf.voxelTextures.length}`);
  assert.ok(inf.boxCaps.some((v) => v !== null), '*BOXCAP must bind at least one slot');
  assert.ok(inf.voxelTextures.every((t) => t.filename.length > 0));
  // `.SET #n` must expand into n consecutive entries sharing a filename.
  const sets = new Map();
  for (const t of inf.voxelTextures) if (t.setIndex >= 0) sets.set(t.filename, (sets.get(t.filename) ?? 0) + 1);
  for (const [name, n] of sets) assert.match(name, /\.SET$/, `${name} with setIndex should be a .SET`);
});

test('every texture a level references can actually be decoded', async () => {
  const source = nodeSource(ARENA_PATH);
  const targets = ['IMPPAL.MIF', 'START.MIF', '39300577.MIF'];
  for (const name of targets) {
    const mif = await data.mif(name);
    for (const level of mif.levels) {
      const inf = await data.inf(level.info.toUpperCase());
      const decoded = decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
      const built = buildLevelMesh(decoded, { wantCollider: false });
      assert.ok(built.materials.length > 0, `${name}: no materials`);
      for (const material of built.materials) {
        const upload = await data.texture(material.ref);
        assert.ok(upload, `${name}: ${material.key} did not decode`);
        assert.ok(upload.width > 0 && upload.height > 0);
        assert.equal(upload.colors.length, upload.width * upload.height * 4, `${material.key}: RGBA length`);
      }
    }
  }
  void source;
});

test('buildLevelMesh emits correctly wound, collidable geometry', async () => {
  const mif = await data.mif('39300577.MIF');
  const level = mif.levels[0];
  const inf = await data.inf(level.info.toUpperCase());
  const decoded = decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
  const built = buildLevelMesh(decoded);

  assert.equal(built.model.positions.length % 3, 0);
  // Four vertices and six indices (two triangles) per quad.
  assert.equal(built.model.indices.length, (built.model.positions.length / 3) * 1.5);
  assert.equal(built.model.normals.length, built.model.positions.length);
  assert.equal(built.model.uvs.length / 2, built.model.positions.length / 3);

  // Sub-meshes must tile the index buffer without gaps or overlaps.
  let cursor = 0;
  for (const sm of built.model.subMeshes) {
    assert.equal(sm.startIndex, cursor);
    assert.equal(sm.textureArchive, ARENA_TEXTURE_ARCHIVE);
    cursor += sm.primitiveCount * 3;
  }
  assert.equal(cursor, built.model.indices.length, 'sub-meshes must cover every index');

  // Winding: each triangle's geometric normal must agree with its vertex normal.
  let wrong = 0;
  const { positions, indices, normals } = built.model;
  for (let t = 0; t < indices.length; t += 3) {
    const [i0, i1, i2] = [indices[t], indices[t + 1], indices[t + 2]];
    const ax = positions[i1 * 3] - positions[i0 * 3];
    const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
    const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
    const bx = positions[i2 * 3] - positions[i0 * 3];
    const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
    const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const dot = cx * normals[i0 * 3] + cy * normals[i0 * 3 + 1] + cz * normals[i0 * 3 + 2];
    if (dot <= 0) wrong++;
  }
  assert.equal(wrong, 0, `${wrong} triangles are wound against their own normal`);

  // The collider is the same triangle soup, so geometry and collision cannot drift:
  //
  //     collider quads = drawn quads − drawn-but-not-solid + collision-only quads
  //
  // Every quad is accounted for, which is a stronger claim than "the collider is a subset
  // of the mesh" was — and the collision-only quads are the floors under solid boxes, an
  // invisible quad each, which is the price of no cell being bottomless (see below).
  assert.ok(built.collider.indices.length > 0);
  assert.equal(built.collider.positions.length % 3, 0);
  assert.equal(built.stats.colliderTris / 2,
    built.stats.quads - built.stats.drawnNotSolid + built.stats.colliderOnlyQuads,
  'every drawn quad and every invisible one is accounted for in the collision soup');

  // Non-colliding decor must be excluded from the soup. A wooden arch with its
  // collider bit clear (0x9 with bit 0x100 set) is the documented case; this map
  // has none, so build one directly.
  const decorLevel = {
    width: 1, depth: 1, ceilingScale: 1, layerCount: 3, floorY: 1, ceilingY: 2,
    outdoors: false, inf, startPoints: [], spawn: null, stats: {},
    cells: [{
      x: 0, z: 0, floor: { texture: 0, flatIndex: -1, chasm: null }, kind: 'transparent',
      sideTexture: 1, capTexture: -1, bottomTexture: -1, yOffset: 0, ySize: 0, facing: -1,
      doorKind: null, solid: false, entityFlatIndex: -1, ceiling: true, ceilingTexture: 0,
      rawFlor: 0, rawMap1: 0, rawMap2: 0,
    }],
  };
  const decor = buildLevelMesh(decorLevel);
  const bare = buildLevelMesh({ ...decorLevel, cells: [{ ...decorLevel.cells[0], kind: 'air', solid: false }] });
  assert.equal(decor.collider.indices.length, bare.collider.indices.length,
    'a non-solid arch must add nothing to the collision soup');
  assert.ok(decor.model.indices.length > bare.model.indices.length, 'but it must still be drawn');
});

test('the Imperial Dungeons\u2019 way out is its own stair, and beside it \u2014 not the deepest cell', async () => {
  // The owner, 2026-10-17: *"move the exit from the imperial prison target really where the exit
  // is"*. `START.MIF` carries **one** stair, its `GATE.IMG` up-stair to the world, and the
  // escape objective used the deepest reachable chamber like every other stage \u2014 which in a
  // 50\u00d750 maze points away from the door. `wayOutCell` answers the cell a player stands in to
  // take that stair: one of its four neighbours, the first that is walkable.
  const mif = await data.mif('START.MIF');
  const raw = mif.levels[0];
  const inf = await data.inf(raw.info);
  const level = decodeLevel(raw, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
  // The stair is found by its **array position**, which is this grid's world reading: `row` is
  // world x and `col` world z (`mifMesh.js`), and a cell's own `x`/`z` fields are the reverse of
  // that (`makeCell(col, row)`; `flats.js` writes the same swap down). Finding it by `cell.x`
  // would transpose the level and test the wrong neighbours.
  const stairs = [];
  for (let i = 0; i < level.cells.length; i++) {
    if (level.cells[i]?.stair === 'up') stairs.push({ x: Math.floor(i / level.width), z: i % level.width });
  }
  assert.equal(stairs.length, 1, `START.MIF carries ${stairs.length} up-stairs, not one`);
  const out = wayOutCell(level);
  assert.ok(out, 'the level marks a way out');
  assert.deepEqual(out.stair, stairs[0], 'and it reports the stair it is the way out of');
  // It is the stair's own neighbour \u2014 adjacent, and not the stair cell itself (a stair is solid).
  assert.equal(Math.max(Math.abs(out.x - stairs[0].x), Math.abs(out.z - stairs[0].z)), 1,
    `way out ${out.x},${out.z} is not beside the stair ${stairs[0].x},${stairs[0].z}`);
  const cell = level.cells[out.x * level.width + out.z];
  assert.ok(cell && !cell.solid && !cell.floor?.chasm, 'the player can stand at the way out');
  // A level that marks no way out answers null rather than inventing one: the caller falls back
  // to its own target, which is how a dungeon whose art this install lacks still gets an objective.
  assert.equal(wayOutCell({ width: 1, depth: 1, cells: [level.cells[0]] }), null);
  assert.equal(wayOutCell(null), null);
});

test('a sign on an edge is drawn from both sides, so it is never a one-way panel', async () => {
  // The owner, 2026-10-17: *"all pngs that are fixed in place like signs or feces need to be
  // visible from both sides"*. A `0xA` **edge** is the port's sign — a shop's board, a
  // tavern's, a washing line, a city gate's grill — and it is one quad on one face of its
  // cell. The mesher emitted that face alone, so with the world pass culling back faces (under
  // a mirrored projection) the board disappeared the moment the player walked round it. Both
  // windings are emitted now, on the same four corners, exactly as a door's panel is: each is
  // seen from its own side, and two coplanar faces that are never visible together cannot
  // z-fight.
  // A city's own `.INF`, so the sign's texture index resolves to real art: the shop signs are
  // index 6 and its pair (`T_TEQ.IMG`), as `game/shops.js` reads them.
  const inf = await data.inf('CAS.INF');
  const cell = {
    x: 0, z: 0, floor: { texture: 0, flatIndex: -1, chasm: null }, kind: 'edge',
    sideTexture: 6, capTexture: -1, bottomTexture: -1, yOffset: 0, ySize: 0, facing: 0,
    doorKind: null, solid: false, entityFlatIndex: -1, ceiling: true, ceilingTexture: 0,
    rawFlor: 0, rawMap1: 0, rawMap2: 0,
  };
  const base = {
    width: 1, depth: 1, ceilingScale: 1, layerCount: 3, floorY: 1, ceilingY: 2,
    outdoors: false, inf, startPoints: [], spawn: null, stats: {}, cells: [cell],
  };
  // Four vertices to a quad, three floats a vertex. The cell's own floor and ceiling are quads
  // too (`buildLevelMesh` lays a floor under every cell), so the **panel** is the pair whose
  // normal is horizontal: those are the two faces of the sign.
  const panelsOf = (built) => {
    const quads = built.model.positions.length / 12;
    const out = [];
    for (let q = 0; q < quads; q++) {
      const n = [0, 1, 2].map((k) => built.model.normals[q * 12 + k]);
      if (n[1] === 0) out.push({ n, corners: [0, 1, 2, 3].map((v) => [0, 1, 2].map((k) => built.model.positions[(q * 4 + v) * 3 + k]).join(',')).sort() });
    }
    return out;
  };
  for (const facing of [0, 1, 2, 3]) {
    const panels = panelsOf(buildLevelMesh({ ...base, cells: [{ ...cell, facing }] }));
    assert.equal(panels.length, 2, `facing ${facing}: the sign is ${panels.length} panel(s), not two`);
    assert.deepEqual(panels[1].n, panels[0].n.map((v) => -v),
      `facing ${facing}: normals ${JSON.stringify([panels[0].n, panels[1].n])} are not opposite`);
    assert.deepEqual(panels[1].corners, panels[0].corners,
      `facing ${facing}: the two faces are not the same panel`);
  }
});

test('main-story vertical textures are upright and read left-to-right on every front face', async () => {
  for (const name of ['START.MIF', '39300577.MIF', '41649375.MIF', 'IMPPAL.MIF']) {
    const mif = await data.mif(name);
    for (const raw of mif.levels) {
      const inf = await data.inf(raw.info);
      const level = decodeLevel(raw, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
      const built = buildLevelMesh(level);
      let faces = 0;
      for (const mesh of [built.model, ...built.doors.map(door => door.model)]) {
        const { positions: p, normals: n, uvs: uv } = mesh;
        for (let base = 0; base < p.length / 3; base += 4) {
          if (Math.abs(n[base * 3 + 1]) > 0.01) continue;
          let du = 0, dv = 0;
          const rightX = -n[base * 3 + 2], rightZ = n[base * 3];
          const meanU = [0,1,2,3].reduce((s, j) => s + uv[(base+j)*2], 0) / 4;
          const meanV = [0,1,2,3].reduce((s, j) => s + uv[(base+j)*2+1], 0) / 4;
          for (let j = 0; j < 4; j++) {
            const i = base + j;
            du += (p[i*3] * rightX + p[i*3+2] * rightZ) * (uv[i*2] - meanU);
            dv += p[i*3+1] * (uv[i*2+1] - meanV);
          }
          assert.ok(du > 0 && dv > 0, `${name}: face ${base/4} mirrored or inverted (${du}, ${dv})`);
          faces++;
        }
      }
      assert.ok(faces > 100, `${name} exercises dungeon walls`);
    }
  }
});

test('a chasm is a pit or a pool below the surface, deep enough to climb out of', async () => {
  // The original draws a chasm as a bed below the surface with a bank around it
  // (`ArenaChasmUtils`: a wet or lava chasm may be swum in). The Imperial Dungeons hold
  // 264 wet-chasm cells — the water the player reported as a flat black plane — and this
  // checks the three things that make it read as water instead.
  const mif = await data.mif('START.MIF');
  const level = mif.levels[0];
  const inf = await data.inf(level.info.toUpperCase());
  const decoded = decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
  const built = buildLevelMesh(decoded);
  const chasms = decoded.cells.filter((c) => c.floor.chasm);
  assert.ok(chasms.length > 100, `${chasms.length} chasm cells in START.MIF`);

  // One bed per chasm cell, and the surface above it is open — a pool is not a floor with
  // a sliver of geometry in it.
  assert.equal(built.stats.chasmBeds, chasms.length, 'every chasm cell gets exactly one bed');
  // A **door** is in this list of exceptions and not in the boxes': the cells that get no
  // surface floor are the boxes that hide their own, and a door hides nothing — the
  // threshold under a doorway is drawn, because the door swings off it (`mifMesh.js`).
  // A **diagonal** is in neither list: it is a box over only half its cell, and the other
  // half is air a body stands in, so its floor is drawn (see "a diagonal is an angle …").
  // **A hedge keeps its ground** (see "a hedge is a box made of a picture with holes" below):
  // its art is 2% palette index 0, so the floor under a hedge cell is drawn while every other
  // solid box still hides its own.
  const isHedge = (c) => c.kind === 'transparent'
    && /NHEDGED?(?:\.IMG)?$/i.test(cellTexture(c, 'side', inf)?.filename ?? '');
  const surfaceFloorCells = decoded.cells.filter((c) => !c.floor.chasm
    && !(c.solid && ['wall', 'transparent'].includes(c.kind) && !isHedge(c))).length;
  assert.equal(built.stats.floorQuads, surfaceFloorCells, 'no chasm cell is given a surface floor');

  // **Deeper than a step, within a body's reach — the law that replaced "shallow enough to walk
  // out of".** This pin used to assert `CHASM_DEPTH <= STEP_OFFSET`: every chasm was shallower than
  // the motor's own step-over, so a pool could never trap a player — and that is exactly what the
  // owner asked to be rid of ("the water should be deep and you should climb out of it"). A chasm
  // is now a thing you are *in*: the bed is deeper than the step, so walking cannot get you out,
  // and the climb has to be able to. Both halves are pinned, because either one alone is a trap:
  // a bed deeper than the reach strands a player, and a bed shallower than the step is a puddle.
  for (const [kind, depth] of Object.entries(CHASM_DEPTHS)) {
    assert.ok(depth > STEP_OFFSET,
      `a ${kind} chasm is only ${depth} m deep, and the motor steps ${STEP_OFFSET} m — it is not a hole`);
    assert.ok(depth <= CLIMB_LEDGE_MAX,
      `and the body must be able to climb out of it: ${depth} m against a ${CLIMB_LEDGE_MAX} m reach`);
  }
  // The one-number export is the deepest bed, for a caller with no cell in hand, and the mesher
  // reads the per-cell answer (`chasmDepthOf`) — so the two can never disagree about a wet chasm.
  assert.equal(CHASM_DEPTH, Math.max(...Object.values(CHASM_DEPTHS)));
  assert.equal(chasmDepthOf('wet'), CHASM_DEPTHS.wet);
  assert.equal(chasmDepthOf(null), CHASM_DEPTHS.dry, 'a chasm of no named kind is the deep pit');

  // Every bed vertex sits exactly `CHASM_DEPTH` under the floor, every bank vertex climbs
  // from the bed to the surface, and both are in set collision: the geometry and the
  // collider are one triangle soup, so a pool cannot be drawn somewhere it cannot be felt.
  const surface = decoded.floorY * CELL_SIZE;
  // **One bed height per kind of chasm** (`mifMesh.js`'s `CHASM_DEPTHS`): a pit, a pool and the
  // palace's lava lake are three different depths, and the mesh carries each cell's own.
  const depths = [...new Set(chasms.map((c) => chasmDepthOf(c.floor.chasm)))].sort((a, b) => a - b);
  const bedsOfDepth = (y) => depths.find((d) => Math.abs(y - (surface - d)) < 1e-6) ?? null;
  /** @type {Map<number, number>} */
  const expectedBeds = new Map();
  for (const cell of chasms) {
    const d = chasmDepthOf(cell.floor.chasm);
    expectedBeds.set(d, (expectedBeds.get(d) ?? 0) + 1);
  }
  const { positions, normals, indices } = built.model;
  // Every *quad* is two triangles over four vertices, so the sides can be read off the
  // index buffer: a bed quad has four vertices at the bed height and a normal that points
  // up, a bank quad has two at the bed and two at the surface with a level normal — and
  // that span is the depth exactly, which is the whole point of the constant.
  /** @type {Map<number, number>} */
  const bedsAt = new Map();
  let banks = 0;
  const yOf = (vertex) => positions[vertex * 3 + 1];
  for (let t = 0; t < indices.length; t += 3) {
    const quad = [indices[t], indices[t + 1], indices[t + 2]];
    if (t % 6) continue;                                       // one pass per quad
    const four = [...quad, indices[t + 3], indices[t + 4], indices[t + 5]];
    const ys = [...new Set(four.map(yOf))];
    const normal = [normals[quad[0] * 3], normals[quad[0] * 3 + 1], normals[quad[0] * 3 + 2]];
    const bedHere = ys.length === 1 ? bedsOfDepth(ys[0]) : null;
    if (bedHere != null && normal[1] > 0.99) bedsAt.set(bedHere, (bedsAt.get(bedHere) ?? 0) + 1);
    if (ys.length === 2 && bedsOfDepth(Math.min(...ys)) != null
      && Math.abs(Math.max(...ys) - surface) < 1e-6 && Math.abs(normal[1]) < 0.01) banks++;
  }
  for (const [depth, count] of expectedBeds) {
    assert.equal(bedsAt.get(depth) ?? 0, count,
      `every chasm ${depth} m deep has one upward-facing bed (${count} of them)`);
  }
  assert.equal([...bedsAt.values()].reduce((a, b) => a + b, 0), chasms.length, 'every chasm cell has one upward-facing bed');
  assert.equal(banks, built.stats.chasmWalls, 'and the banks it needs, each spanning the depth');
  assert.ok(indices.length > 0 && built.collider.indices.length > 0, 'the pool is collidable');

  // ── a wall standing in the pool is an ARCH, not a dam (the owner's "tubes") ────────────
  //
  // *"water pits and pits … are actually sometimes used as tubes to connect two rooms
  // otherwise inaccessible without this … you can even see them in the minimap but are sealed
  // off"*. Arena's wall voxel begins at the **floor plane**, and a chasm's bed is 1.2–1.55 m
  // below it, so the band between bed and floor is open water. The mesher used to emit the
  // chasm's own bank there — bed to surface — sealing every such passage: measured on
  // `START.MIF`, the water run at row 40, column 8 stopped dead at the wall in (43,8) with the
  // player's feet on the bed and `W` held, while the minimap painted all four cells as water.
  //
  // The law the test holds: **no bank is emitted toward a solid cell whose floor is a chasm**
  // (the water continues under it), and the wall's underside is drawn at the floor plane so the
  // tunnel has a ceiling (not collided — the swimmer's head passes beneath it).
  const solidChasm = (c) => Boolean(c) && c.solid && Boolean(c.floor.chasm);
  // The mesher skips a bank whose **neighbour** is a solid cell over a chasm: that is the side
  // the water passes under, whether the cell asking is water or another wall in the same pool.
  let expectedUnderpasses = 0;
  for (let row = 0; row < decoded.depth; row++) {
    for (let col = 0; col < decoded.width; col++) {
      const cell = decoded.cells[row * decoded.width + col];
      if (!cell?.floor.chasm) continue;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nc < 0 || nr >= decoded.depth || nc >= decoded.width) continue;
        if (solidChasm(decoded.cells[nr * decoded.width + nc])) expectedUnderpasses++;
      }
    }
  }
  assert.ok(expectedUnderpasses > 0, 'START.MIF has water under a wall to try (it has 264 wet cells)');
  assert.equal(built.stats.chasmUnderpasses, expectedUnderpasses,
    'every bank toward a wall standing in the pool is left open');
  // And the arch's underside: a **downward** quad at the floor plane inside a solid chasm cell
  // — the tunnel's ceiling, drawn and not collided.
  const solidChasmCells = decoded.cells.filter((c) => solidChasm(c)
    && ['wall', 'transparent'].includes(c.kind) && c.yOffset <= 1e-6).length;
  assert.ok(solidChasmCells > 0);
  assert.equal(built.stats.chasmArches, solidChasmCells, 'every arch gets its underside');
  // A bank still closes the pool against *dry ground*: the count above is the skipped ones, and
  // every remaining bank is a real face (the geometric count already proved that).
  assert.ok(built.stats.chasmWalls > 0);
});

test('no cell of a level is bottomless', async () => {
  // The worst bug this project has had: a cell could hold *nothing* at or below its own
  // floor height once the mesher had skipped the floor of a solid box (the box hides it),
  // so a player who ended up inside one — by a teleport, by a level's own start point, by
  // a monster's shove — fell through the world and never landed. Measured on the real maps
  // before the fix: 1 509 bottomless cells in `START.MIF` (1 495 walls and 14 doors — a
  // solid box's floor is skipped, and so is its cap when the level's MAP2 ceilings it),
  // and 4 793 in `39300577.MIF`.
  for (const [mifName, mapType] of [['START.MIF', 'interior'], ['39300577.MIF', 'interior']]) {
    const mif = await data.mif(mifName);
    const level = mif.levels[0];
    const inf = await data.inf(level.info.toUpperCase());
    const decoded = decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType });
    const built = buildLevelMesh(decoded);

    // Every solid box gets a collision-only floor, no more and no fewer — a **door**
    // excepted, since its floor is the drawn threshold of a doorway rather than a hidden
    // slab under a wall (and its own triangles are the door's, `built.doors`, not the
    // level's: `mifMesh.js`'s door bundles).
    const boxes = decoded.cells.filter((c) => c.solid && !c.floor.chasm
      && ['wall', 'transparent'].includes(c.kind) && c.yOffset <= 1e-4).length;
    assert.equal(built.stats.colliderOnlyQuads, boxes, `${mifName}: collision floors under solid boxes`);

    // And so every cell has something level to stand on at or below the floor plane: a
    // ceiling or a box's cap is *above* it and cannot hold a player up.
    const S = CELL_SIZE;
    const walkable = decoded.floorY * S + 1e-3;
    const covered = new Uint8Array(decoded.width * decoded.depth);
    const { positions, indices } = built.collider;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      const ys = [positions[a * 3 + 1], positions[b * 3 + 1], positions[c * 3 + 1]];
      if (ys[0] > walkable || Math.abs(ys[0] - ys[1]) > 1e-6 || Math.abs(ys[0] - ys[2]) > 1e-6) continue;
      const xs = [positions[a * 3], positions[b * 3], positions[c * 3]];
      const zs = [positions[a * 3 + 2], positions[b * 3 + 2], positions[c * 3 + 2]];
      for (let row = Math.floor(Math.min(...xs) / S); row <= Math.floor((Math.max(...xs) - 1e-6) / S); row++) {
        for (let col = Math.floor(Math.min(...zs) / S); col <= Math.floor((Math.max(...zs) - 1e-6) / S); col++) {
          if (row < 0 || col < 0 || row >= decoded.depth || col >= decoded.width) continue;
          covered[row * decoded.width + col] = 1;
        }
      }
    }
    const missing = [];
    for (let i = 0; i < covered.length; i++) {
      if (!covered[i]) missing.push(`row ${Math.floor(i / decoded.width)} col ${i % decoded.width} (${decoded.cells[i].kind})`);
    }
    assert.deepEqual(missing.slice(0, 5), [], `${mifName}: ${missing.length} cells have nothing under them`);
  }
});

test('MIF dimensions and cell scale are sane', async () => {
  const mif = await data.mif('START.MIF');
  const level = mif.levels[0];
  const inf = await data.inf(level.info.toUpperCase());
  const decoded = decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
  assert.equal(decoded.floorY, 1);
  assert.equal(decoded.ceilingY, 2);
  assert.ok(decoded.ceilingScale > 0.5 && decoded.ceilingScale < 3, `ceilingScale ${decoded.ceilingScale}`);
  // Spawn must be inside the grid and not inside a solid.
  const row = Math.floor(decoded.spawn.x), col = Math.floor(decoded.spawn.z);
  assert.ok(row >= 0 && row < mif.height && col >= 0 && col < mif.width);
  assert.equal(decoded.cells[row * mif.width + col].solid, false);
});

test('a hand-written INF parses the documented grammar', () => {
  const text = [
    '@FLOORS', '*CEILING 200 128', '*BOXCAP 0', 'floor_a.img', '*BOXCAP 1', 'walls.set   #2',
    '@WALLS', '*BOXSIDE 0', 'side_a.img', '*DRYCHASM', 'dry.img', '*LEVELUP', 'up.img',
    '@FLATS', '*ITEM 3', 'candl.dfa  Y:-4  S:2',
    '',
  ].join('\r\n');
  const inf = parseInfText(text, 'TEST.INF');
  assert.equal(inf.ceiling.height, 200);
  assert.equal(inf.ceiling.boxScale, 128);
  assert.equal(inf.ceiling.textureIndex, 0);
  assert.equal(inf.boxCaps[0], 0);
  assert.equal(inf.boxCaps[1], 1);
  // floor_a.img, walls.set ×2, side_a.img, dry.img, up.img
  assert.equal(inf.voxelTextures.length, 6, 'a .SET #2 line must add two entries');
  assert.equal(inf.voxelTextures[2].setIndex, 1);
  assert.equal(inf.boxSides[0], 3);
  assert.equal(inf.dryChasmIndex, 4);
  assert.equal(inf.levelUpIndex, 5);
  assert.equal(inf.flats.length, 1);
  assert.equal(inf.flats[0].itemIndex, 3);
  assert.equal(inf.flats[0].yOffset, -4);
  assert.equal(inf.flats[0].lightIntensity, 2);
});

test('IMG decoding handles the raw 64x64 wall form and headered forms', async () => {
  const source = nodeSource(ARENA_PATH);
  // A known raw wall texture: exactly 4096 bytes and no header.
  const raw = await data.must('CASA.SET').catch(() => null);
  assert.ok(raw, 'CASA.SET should exist');
  assert.equal(raw.length, 4 * 64 * 64, '.SET files are 64x64 chunks');

  const archive = await data.bsa();
  let headered = 0;
  let rawWalls = 0;
  for (const name of archive.names().filter((n) => n.endsWith('.IMG')).slice(0, 120)) {
    const bytes = archive.get(name);
    try {
      const image = parseImg(bytes, name);
      assert.ok(image.width > 0 && image.height > 0);
      assert.equal(image.indices.length, image.width * image.height, `${name} pixel count`);
      if (bytes.length === 4096) rawWalls++;
      else headered++;
    } catch (err) {
      // A few .IMG files in Arena are known-bad or use an unsupported flag; those
      // must be rare, and the error must name the file.
      assert.match(err.message, /IMG/, `${name}: ${err.message}`);
    }
  }
  assert.ok(rawWalls > 5, `expected raw 4096-byte wall images, saw ${rawWalls}`);
  assert.ok(headered > 20, `expected headered images, saw ${headered}`);
  void source;
});

test('a city block\'s upper floors are mass Arena stores, and are drawn as storeys', async () => {
  // **The buildings were one storey tall because the decoder threw this away.** A `MAP2`
  // voxel is not just "there is a lid here": it carries a height class (1…4 voxel layers)
  // and its own texture, and in a city that mass *is* the building above its ground floor.
  // Measured over the install's block `.MIF`s: 356 of 368 hold more than one layer.
  const inf = await data.inf('TCN.INF');
  const mif = await data.mif('BSBD13B.MIF');
  const level = decodeLevel(mif.levels[0], inf, { width: mif.width, depth: mif.height, mapType: 'city' });

  const stocked = level.cells.filter((c) => c.upperLayers > 0);
  const tall = level.cells.filter((c) => c.upperLayers > 1);
  const layers = stocked.reduce((n, c) => n + c.upperLayers, 0);
  assert.ok(stocked.length > 20, `only ${stocked.length} cells carry mass above the ground floor`);
  assert.ok(tall.length > 0, 'this block should hold at least one cell taller than one storey');
  assert.ok(layers > stocked.length, `the mass should be more than one layer per cell, saw ${layers} over ${stocked.length} cells`);
  assert.ok(stocked.every((c) => c.ceiling && c.ceilingTexture >= 0), 'every mass cell is also a ceiling, with art');

  // Drawn: the flag adds geometry and the roofs stand above the ceiling line.
  const flat = buildLevelMesh(level, { upperStoreys: false });
  const built = buildLevelMesh(level, { upperStoreys: true });
  assert.equal(built.stats.upperBoxes, stocked.length, 'one box per cell that holds mass');
  assert.equal(built.stats.upperLayers, layers, 'and one drawn layer per layer of mass');
  assert.equal(built.stats.roofQuads, stocked.length, 'and one roof per box');
  assert.ok(built.model.indices.length > flat.model.indices.length, 'the storeys must be drawn');
  // Every storey quad is non-colliding: the mass starts a full storey above the floor, so
  // the player can never touch it, and the collision soup is left exactly as it was.
  assert.equal(built.collider.indices.length, flat.collider.indices.length,
    'the upper floors must add nothing to the collision soup');
  assert.equal(built.stats.drawnNotSolid - flat.stats.drawnNotSolid, built.stats.upperBoxes * 5,
    'each box is four sides and one roof, all drawn and none solid');
  let highest = -Infinity;
  for (let i = 1; i < built.model.positions.length; i += 3) highest = Math.max(highest, built.model.positions[i]);
  assert.ok(highest >= (level.ceilingY + 2) * CELL_SIZE,
    `the tallest roof should be two storeys above the ceiling, saw y=${highest}`);

  // A dungeon is the control: its `MAP2` is the stone above a ceiling, so the flag must
  // change nothing at all there.
  const dungeonInf = await data.inf('HALLS1.INF');
  const dungeonMif = await data.mif('39300577.MIF');
  const dungeon = decodeLevel(dungeonMif.levels[0], dungeonInf, {
    width: dungeonMif.width, depth: dungeonMif.height, mapType: 'interior',
  });
  const dungeonFlat = buildLevelMesh(dungeon, { upperStoreys: false });
  const dungeonBuilt = buildLevelMesh(dungeon, { upperStoreys: true });
  assert.equal(dungeonBuilt.model.indices.length, dungeonFlat.model.indices.length,
    'an interior draws no upper storeys');
  assert.equal(dungeonBuilt.stats.upperBoxes, 0);
});

/** Byte offset of a four-character MIF chunk tag. */
function indexOfTag(bytes, tag) {
  const want = [tag.charCodeAt(0), tag.charCodeAt(1), tag.charCodeAt(2), tag.charCodeAt(3)];
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] === want[0] && bytes[i + 1] === want[1] && bytes[i + 2] === want[2] && bytes[i + 3] === want[3]) return i;
  }
  throw new Error(`${tag} not found`);
}

test("a settlement's gate is one opening in its wall, and nothing in it collides", async () => {
  // The owner, playing beside the original: *"CITY GATES SHOULD HAVE NO COLLISION SO I CAN ACTUALLY
  // GO INTO THE WILDERNESS"*. The opening is the outermost line's own `0x9` gateway voxel, and
  // `openSettlementGate` marks it `gateway: true` — drawn as always, in nobody's collision soup.
  const archive = await data.bsa();
  const skeletons = archive.names().filter((n) => /^(CITYW?[0-9]|TOWN[0-9]|TOWNW[0-9]|VILLAGE[0-9])\.MIF$/i.test(n));
  assert.equal(skeletons.length, 20, `the shipped settlement skeletons, saw ${skeletons.sort().join(' ')}`);
  const inf = await data.inf('TCN.INF');

  for (const name of skeletons) {
    const mif = await data.mif(name);
    const level = decodeLevel(mif.levels[0], inf, { width: mif.width, depth: mif.height, mapType: 'city' });
    const before = buildLevelMesh(level, { upperStoreys: true });

    const opened = openSettlementGate(level);
    // The arch: the file's own `0x9` gateway voxels, one run of two cells.
    const isArch = (g) => ((level.cells[g.row * mif.width + g.col].rawMap1 & 0xf000) >> 12) === 0x9;
    const arch = opened.filter(isArch);
    assert.equal(arch.length, 2, `${name}: one arch of two cells, saw ${JSON.stringify(opened)}`);
    assert.equal(arch[0].axis, arch[1].axis, `${name}: both cells of the opening stand on one line`);
    const along = arch[0].axis === 'north' || arch[0].axis === 'south' ? 'col' : 'row';
    assert.equal(Math.abs(arch[1][along] - arch[0][along]), 1,
      `${name}: the two arch cells are side by side, saw ${JSON.stringify(arch)}`);
    assert.ok(opened.every((g) => g.row === 0 || g.col === 0 || g.row === mif.height - 1 || g.col === mif.width - 1),
      `${name}: every gate is in the settlement's outermost line`);

    // **…and every door picture on that line is a gate too.** The owner, 2026-10-22: *"in both pc
    // and phone you should be able to use all door textures on the citywalls of villages and town
    // to get in and out of said towns not just the main gate"*. A wall cell wearing the gate's own
    // leaves (`T_DLGT.IMG` / `T_DRGT.IMG`) stands over street, so it is a way through: marked
    // `gateway`, returned as a gate in its own right, and drawn exactly as before.
    const doors = opened.filter((g) => !isArch(g));
    for (const gate of doors) {
      const cell = level.cells[gate.row * mif.width + gate.col];
      assert.equal(cell.gateway, true, `${name}: the door at ${gate.row},${gate.col} is a gate`);
      assert.match(String(inf.voxelTextures[cell.sideTexture]?.filename ?? ''), /^(?:T_)?D(?:L|R)GT\.IMG$/i,
        `${name}: ${gate.row},${gate.col} really wears a door picture`);
      const inward = gate.axis === 'north' ? [gate.row + 1, gate.col]
        : gate.axis === 'south' ? [gate.row - 1, gate.col]
          : gate.axis === 'west' ? [gate.row, gate.col + 1] : [gate.row, gate.col - 1];
      const behind = level.cells[inward[0] * mif.width + inward[1]];
      assert.equal(Boolean(behind) && !behind.solid, true,
        `${name}: the door at ${gate.row},${gate.col} opens onto street, not a wall`);
    }
    // The skeletons that wear them: every village paints at least one pair of gate leaves beside
    // its arch (VILLAGE1 draws three pairs, VILLAGE4 one), and a city its own pair.
    if (/^VILLAGE|^CITY/i.test(name)) {
      assert.ok(doors.length >= 2, `${name}: ${doors.length} doors, saw ${JSON.stringify(doors)}`);
    }
    // **The illustrated gate posts are part of the way through.** They stand behind the arch
    // wearing `PGATE.IMG`; every one of them is marked `gateway` and therefore leaves the
    // collision soup (the owner: all gate-art walls must be passable).
    const gateArt = level.gateArtCells ?? [];
    assert.ok(gateArt.length >= 2, `${name}: the gate's own posts are read off its art`);
    for (const spot of gateArt) {
      const cell = level.cells[spot.row * mif.width + spot.col];
      assert.equal(cell.gateway, true, `${name}: gate-art wall ${spot.row},${spot.col} is a gate`);
      assert.match(String(inf.voxelTextures[cell.sideTexture]?.filename ?? ''), /^[DMP]GATE\.IMG$/i,
        `${name}: ${spot.row},${spot.col} really wears gate art`);
    }

    const after = buildLevelMesh(level, { upperStoreys: true });
    assert.equal(after.model.indices.length, before.model.indices.length,
      `${name}: the gate is still drawn exactly as the file says — nothing was moved, hidden or re-textured`);
    const gone = before.stats.colliderTris - after.stats.colliderTris;
    assert.ok(gone > 0, `${name}: the opening's boxes left the collision soup`);
    assert.equal(after.stats.drawnNotSolid - before.stats.drawnNotSolid, gone / 2,
      `${name}: every quad that left the collider is still drawn (${gone} triangles)`);

    assert.deepEqual(openSettlementGate(level), [], `${name}: opening a gate twice opens nothing`);
  }

  // **A line with more than one opening is a building, and is refused whole.** A city block's own
  // `.MIF` carries `0x9` arches along its line too — they are its shopfronts, with street behind
  // them — so without the single-run reading this rule would punch holes in a facade.
  for (const [name, why] of [['NBBD6A.MIF', 'one wide run of fourteen arches'], ['TSBD7A.MIF', 'two runs, on two different lines']]) {
    const mif = await data.mif(name);
    const level = decodeLevel(mif.levels[0], inf, { width: mif.width, depth: mif.height, mapType: 'city' });
    assert.deepEqual(openSettlementGate(level), [], `${name} (${why}) is not a settlement and gets no gate`);
    assert.equal(level.cells.filter((c) => c.gateway).length, 0, `${name}: and not one cell is marked`);
  }
});

test('the map has an edge again: a quest dungeon\'s whole outer ring is walled', async () => {
  // The owner, 2026-10-17: *"main story dungeons walls at some angles instead of connecting two walls
  // are vertical and lead off the map"*. The data is the reason: **Arena's levels simply stop.**
  // Measured over the sixteen quest dungeons, the whole outer ring is walkable open air — 396 of a
  // 100×100 level's ring cells on Dagoth-Ur, Black Gate and the Halls of Colossus, 476 on the 120×120
  // Black Gate, 195 of the palace's 196 — so every wall at the edge stands in the air and a player can
  // walk off the side of the world. `buildLevelMesh`'s boundary pass builds the wall the data never
  // needed, out of the level's own art, and this pin holds it to the level's own ring: one quad per
  // open ring cell's outward face, and a face in the collider a player cannot cross.
  const mif = await data.mif('42026882.MIF');
  const inf = await data.inf(mif.levels[0].info);
  const level = decodeLevel(mif.levels[0], inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
  const { width, depth, cells } = level;
  const at = (row, col) => cells[row * width + col];
  const walled = (cell) => Boolean(cell) && cell.solid
    && (cell.kind === 'wall' || cell.kind === 'door' || cell.kind === 'transparent' || cell.kind === 'diagonal')
    && cell.yOffset <= 1e-4;
  const openRing = [];
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      if (!(row === 0 || col === 0 || row === depth - 1 || col === width - 1)) continue;
      const cell = at(row, col);
      if (!walled(cell) && !cell.gateway) openRing.push({ row, col });
    }
  }
  assert.ok(openRing.length > 300, `Dagoth-Ur's ring is the whole edge: ${openRing.length} open cells`);

  // Without the pass nothing is drawn there — the level's own mesh has no boundary quad at all.
  const bare = buildLevelMesh(level);
  assert.equal(bare.stats.boundaryQuads, 0, 'the pass is opt-in: a caller that asks for nothing gets nothing');

  const built = buildLevelMesh(level, { boundaryWalls: true });
  assert.ok(built.stats.boundaryQuads >= openRing.length,
    `${openRing.length} open ring cells should be walled, got ${built.stats.boundaryQuads}`);
  assert.ok(built.stats.boundaryQuads < openRing.length * 2,
    'and a ring cell is walled on the faces that face off the map, not on all four');

  // The wall is in the collider as well as the picture: a ray out of every open ring cell hits it.
  const collider = new Collider();
  collider.addMesh('level', built.collider.positions, built.collider.indices, identity());
  const y = level.floorY * CELL_SIZE + 1;
  for (const { row, col } of openRing) {
    const x = (row + 0.5) * CELL_SIZE;
    const z = (col + 0.5) * CELL_SIZE;
    const outward = [];
    if (row === 0) outward.push([-1, 0]);
    if (row === depth - 1) outward.push([1, 0]);
    if (col === 0) outward.push([0, -1]);
    if (col === width - 1) outward.push([0, 1]);
    for (const [dx, dz] of outward) {
      assert.ok(Number.isFinite(collider.raycast([x, y, z], [dx, 0, dz], CELL_SIZE * 1.4)),
        `the edge at ${row},${col} still leads off the map toward ${dx},${dz}`);
    }
  }
});

test('a pit is a hole you can climb out of — and a wall standing in it is a tube you swim under', async () => {
  // The owner, 2026-10-17: *"i still fall off maps in pits and water pits … and you can go
  // outside boundaries of the dungeon"*. The bank of a chasm was skipped wherever the cell
  // beside it was a structure — "a structure already draws this face" — but a structure's own
  // faces start at the FLOOR PLANE and the bank runs from the **bed** up to that plane, so the
  // two never overlapped and the whole band between them was simply absent. Measured over the
  // install's seventeen quest dungeons (`.scratch/pitprobe.mjs`): **25 990** sides of a pit had
  // nothing in them — 4 009 on `39950681`'s second level, 2 416 on `40852494`'s — and a body
  // standing on a bed walked straight into the rock. Inside the rock there is no floor at all,
  // so the next step off the bed was off the map: both halves of the report, one gap.
  //
  // A wall standing in a flooded room carries the **same chasm floor** as the water beside it,
  // and the first repair still asked only the floor ("the pool continues"), which left 11 940
  // of them open. What continues is the pool *cell*: not solid, water floor.
  for (const [mifName, levelIndex] of [['START.MIF', 0], ['39950681.MIF', 1], ['39300577.MIF', 0], ['42026882.MIF', 2]]) {
    const mif = await data.mif(mifName);
    const raw = mif.levels[levelIndex];
    const inf = await data.inf(raw.info.toUpperCase());
    const level = decodeLevel(raw, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
    const { width, depth, cells } = level;
    const at = (row, col) => (row < 0 || col < 0 || row >= depth || col >= width ? null : cells[row * width + col]);
    const built = buildLevelMesh(level, { boundaryWalls: true });
    const collider = new Collider();
    collider.addMesh('level', built.collider.positions, built.collider.indices, identity());
    /**
     * The pool continues into this cell: nothing is built on the boundary between them.
     *
     * **A wall standing in the water continues it too** (the owner's *"tubes"*): the wall's own
     * box starts at the floor plane and the bed is 1.2–1.55 m below it, so the band under the
     * wall is open water. The mesher therefore builds no bank toward a solid cell whose floor is
     * a chasm — otherwise every flooded passage on the minimap was a dead end.
     */
    const continues = (nb) => Boolean(nb) && Boolean(nb.floor.chasm);

    let chasmCells = 0;
    let rims = 0;
    for (let row = 0; row < depth; row++) {
      for (let col = 0; col < width; col++) {
        const cell = at(row, col);
        if (!cell.floor.chasm) continue;
        chasmCells++;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          if (!continues(at(row + dr, col + dc))) rims++;
        }
      }
    }
    assert.ok(chasmCells > 30, `${mifName} level ${levelIndex} has pits to stand in: ${chasmCells}`);
    // One bank, both sides, on every side that is not a continuation of the pool — the count is
    // exact, so a bank that stops being emitted anywhere shows up here and not only in the rays.
    assert.equal(built.stats.chasmWalls, rims * 2,
      `${mifName}: a bank on every side that is not open water`);

    // **The bed is enclosed, and a wall standing in the pool is a way through.** At chest height
    // on the bed the ray hits every bank but passes under a wall whose floor is a chasm; above
    // the water line that same wall is solid. Both halves in one walk: without the first the
    // player leaves the level through the rock (the old report), without the second every tube
    // the minimap paints as water is a dead end (the owner's 2026-10-19 report).
    const surface = level.floorY * CELL_SIZE;
    let probes = 0;
    let under = 0;
    for (let row = 0; row < depth; row++) {
      for (let col = 0; col < width; col++) {
        const cell = at(row, col);
        if (!cell.floor.chasm) continue;
        const bedY = surface - chasmDepthOf(cell.floor.chasm);
        const x = (row + 0.5) * CELL_SIZE;
        const z = (col + 0.5) * CELL_SIZE;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nb = at(row + dr, col + dc);
          if (continues(nb)) continue;
          probes++;
          assert.ok(Number.isFinite(collider.raycast([x, bedY + 0.6, z], [dr, 0, dc], CELL_SIZE * 1.5)),
            `${mifName}: the pit at ${row},${col} lets a body out toward ${dr},${dc} (${nb ? nb.kind + (nb.solid ? ', solid' : '') : 'off the map'})`);
        }
        // …and toward a solid chasm neighbour the tube is open at chest height, shut above the
        // surface.
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nb = at(row + dr, col + dc);
          if (!nb || !nb.solid || !nb.floor.chasm) continue;
          under++;
          // **Short of the wall's far face**: the tube is a passage *through* the cell, so a ray
          // that ran the whole 1.5 cells would leave it on the other side and hit the next wall.
          assert.ok(!Number.isFinite(collider.raycast([x, bedY + 0.6, z], [dr, 0, dc], CELL_SIZE * 0.75)),
            `${mifName}: the tube under the wall at ${row + dr},${col + dc} is sealed at the bed`);
          // The wall above the water line is the mesh's own box and is not this test's to draw:
          // the change below the surface removes only the bank, so what the player meets on dry
          // land at floor height is exactly what it was.
        }
      }
    }
    assert.ok(probes > 200, `${mifName}: ${probes} sides of a pit were walked`);
    assert.ok(under > 0, `${mifName}: ${under} water tubes under a wall were tried`);
  }
});

test('a diagonal is an angle the walls meet, not a slab standing in the gap', async () => {
  // A `0xD` voxel is Arena's chamfer: two wall runs joined by a 45° face, and every quest
  // dungeon is full of them (Dagoth-Ur's first level has 113, `41649375`'s first 182). It is a
  // **thin panel across the cell's diagonal** (`ArenaMeshUtils` `initDiagonalBoxValues`:
  // `diagonalThickness = 0.050`, `boxWidth = Constants::Sqrt2 - diagonalThickness` — "fit the
  // edges of the voxel exactly"), so it fills *half* its cell and its own mesh covers none of
  // the four boundary planes in full. Two walls therefore may not skip the face between them
  // and the diagonal, and one of them did: `hideAgainst` treated "both cells are full boxes"
  // as "drawn twice", leaving a full-height slot at every angle — measured over the install's
  // quest dungeons, **36 675** samples of those planes had no geometry at all beside a wall or
  // an arch, and a body could look and walk through the angle into the void. The owner,
  // 2026-10-17: *"there are walls at the angles that are used instead of making an angle like
  // connecting two walls … its still broken"*.
  //
  // The same pass fills the corner those two walls enclose (the panel alone left the corner
  // hollow, so the angle read as a slab hanging in the air) and finally draws the floor of the
  // cell: hidden as "under a box", the air half of the cell had no floor in the picture —
  // **22 272 of 22 288** samples, a black notch at the foot of every chamfer.
  for (const [mifName, levelIndex] of [['42026882.MIF', 0], ['41649375.MIF', 0], ['42068779.MIF', 0]]) {
    const mif = await data.mif(mifName);
    const raw = mif.levels[levelIndex];
    const inf = await data.inf(raw.info.toUpperCase());
    const level = decodeLevel(raw, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
    const { width, depth, cells } = level;
    const at = (row, col) => (row < 0 || col < 0 || row >= depth || col >= width ? null : cells[row * width + col]);
    const built = buildLevelMesh(level, { boundaryWalls: true });
    const collider = new Collider();
    collider.addMesh('level', built.collider.positions, built.collider.indices, identity());
    const drawn = new Collider();
    drawn.addMesh('drawn', built.model.positions, built.model.indices, identity());
    const S = CELL_SIZE;
    const floorTop = level.floorY * S;
    const roomTop = level.ceilingY * S;
    /** A cell whose own mesh covers all of every side it shares: only a cube does. */
    const wholeSides = (c) => Boolean(c) && c.solid && (c.kind === 'wall' || c.kind === 'transparent') && c.yOffset <= 1e-4;

    const diagonals = [];
    for (let row = 0; row < depth; row++) {
      for (let col = 0; col < width; col++) if (at(row, col).kind === 'diagonal') diagonals.push({ row, col });
    }
    assert.ok(diagonals.length > 50, `${mifName} level ${levelIndex} has angles to check: ${diagonals.length}`);

    // ── one pass over the drawn mesh, for two questions geometry alone can answer ──
    //
    // `planeFaces` — a vertical quad lying in a cell's own boundary plane, keyed by the cell
    // and the direction it faces. A quad on the plane x = n·S is the +x face of row n−1 and
    // the −x face of row n; both are recorded, and the caller asks about the one it means.
    // `caps` — an upward triangle of a cell's own area at exactly the room's top, which is the
    // corner lid. (A level's own ceiling is drawn one epsilon *below* that, so it is not one.)
    const planeFaces = new Set();
    const caps = new Set();
    {
      const { positions, normals, indices } = built.model;
      const v = (i, k) => positions[i * 3 + k];
      for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
        const xs = [v(a, 0), v(b, 0), v(c, 0)];
        const ys = [v(a, 1), v(b, 1), v(c, 1)];
        const zs = [v(a, 2), v(b, 2), v(c, 2)];
        const flat = (arr, plane) => arr.every((q) => Math.abs(q - plane) < 1e-4);
        const vertical = Math.abs(normals[a * 3 + 1]) < 1e-3;
        if (vertical && ys[0] >= floorTop - 1e-4 && ys.every((y) => y <= roomTop + 1e-4)) {
          for (const [arr, plane] of [[xs, xs[0]], [zs, zs[0]]]) {
            if (!flat(arr, plane)) continue;
            const axis = arr === xs ? 'x' : 'z';
            const along = arr === xs ? [zs, 'z'] : [xs, 'x'];
            if (!along[0].every((q) => Math.abs(q - along[0][0]) < S * 1.5)) continue;
            const cellIndex = Math.round(plane / S);
            const across = Math.floor((along[0][0] + along[0][1] + along[0][2]) / 3 / S);
            for (const boundary of [-1, 1]) {
              // A face on the plane n·S is the +face of cell n−1 and the −face of cell n.
              const line = cellIndex + (boundary > 0 ? -1 : 0);
              if (line < 0 || line >= (axis === 'x' ? depth : width)) continue;
              if (across < 0 || across >= (axis === 'x' ? width : depth)) continue;
              planeFaces.add(axis === 'x'
                ? `${line},${across},${boundary > 0 ? 1 : -1},0`
                : `${across},${line},0,${boundary > 0 ? 1 : -1}`);
            }
          }
        }
        if (ys.every((y) => Math.abs(y - roomTop) < 1e-6) && normals[a * 3 + 1] > 0.99) {
          const row = Math.floor((xs[0] + xs[1] + xs[2]) / 3 / S);
          const col = Math.floor((zs[0] + zs[1] + zs[2]) / 3 / S);
          if (row >= 0 && col >= 0 && row < depth && col < width
            && Math.abs(xs[0] + xs[1] + xs[2] - 3 * ((row + 0.5) * S)) < S * 0.7
            && Math.abs(zs[0] + zs[1] + zs[2] - 3 * ((col + 0.5) * S)) < S * 0.7) caps.add(`${row},${col}`);
        }
      }
    }
    const onPlane = (row, col, dr, dc) => planeFaces.has(`${row},${col},${dr},${dc}`);

    let checked = 0;
    let prismFaces = 0;
    let wantedPrism = 0;
    let wantedCaps = 0;
    for (const { row, col } of diagonals) {
      const cell = at(row, col);
      const x0 = row * S, x1 = x0 + S, z0 = col * S, z1 = z0 + S;
      // ── the seam: no boundary plane of the cell may be left with nothing on it ──
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nb = at(row + dr, col + dc);
        if (!wholeSides(nb)) continue;
        const xPlane = dr !== 0;
        const plane = xPlane ? (dr > 0 ? x1 : x0) : (dc > 0 ? z1 : z0);
        for (let k = 1; k <= 5; k++) {
          for (const y of [floorTop + 0.3, floorTop + 1.0, floorTop + 2.0]) {
            if (y > roomTop) continue;
            const along = (xPlane ? z0 : x0) + (k / 6) * S;
            const back = plane - (dr + dc) * 0.15;
            const origin = xPlane ? [back, y, along] : [along, y, back];
            checked++;
            assert.ok(Number.isFinite(collider.raycast(origin, xPlane ? [Math.sign(dr), 0, 0] : [0, 0, Math.sign(dc)], 0.4)),
              `${mifName}: the angle at ${row},${col} leaves a slot on its ${dr},${dc} side`);
          }
        }
      }
      // ── the floor of the whole cell, in the mesh the player is looking at ──
      for (let a = 1; a <= 4; a++) {
        for (let b = 1; b <= 4; b++) {
          assert.ok(Number.isFinite(drawn.raycast([x0 + (a / 5) * S, floorTop + 0.6, z0 + (b / 5) * S], [0, -1, 0], S)),
            `${mifName}: the angle at ${row},${col} has no drawn floor at ${a}/5, ${b}/5`);
        }
      }
      // ── the corner: the solid half is a mass. **The solid half is the one the map asks
      //    for** — the side of the panel with a wall on both of its neighbours, and the
      //    panel's own bit when the cell has no wall neighbour at all (`mifMesh.js` measured
      //    the rule over six quest dungeons: 179 +x/+z against 165 −x/−z under the same bit,
      //    so the bit alone cannot be the answer). ──
      const boxAt = (r, c) => { const q = at(r, c); return Boolean(q) && q.solid
        && ['wall', 'door', 'transparent', 'diagonal'].includes(q.kind) && q.yOffset <= 1e-4; };
      const right = cell.facing === 0;
      const runPlus = boxAt(row + 1, col) && boxAt(row, col + 1);
      const runMinus = boxAt(row - 1, col) && boxAt(row, col - 1);
      const solidPlus = runPlus ? true : runMinus ? false : !right;
      // The panel's own end points and the corners it separates — the same construction the
      // mesher makes, restated here so the pin fails if either side of it drifts.
      const endA = right ? [x0, z1] : [x0, z0];
      const endB = right ? [x1, z0] : [x1, z1];
      const corner = solidPlus ? (right ? [x1, z1] : [x1, z0]) : (right ? [x0, z0] : [x0, z1]);
      for (const from of [endA, endB]) {
        // Each of the wedge's two boundary faces lies on the plane its end point shares with
        // the corner, and faces the neighbour on that side.
        const sharedZ = Math.abs(from[1] - corner[1]) < 1e-4;
        const [dr, dc] = sharedZ
          ? [0, from[1] > (z0 + z1) / 2 ? 1 : -1]
          : [from[0] > (x0 + x1) / 2 ? 1 : -1, 0];
        // A cube beside it draws the plane itself (`wholeSides`), and the prism keeps out of
        // its way there — which is what keeps a chamfer from doubling every wall it touches.
        if (wholeSides(at(row + dr, col + dc))) continue;
        wantedPrism++;
        if (onPlane(row, col, dr, dc)) prismFaces++;
        else assert.fail(`${mifName}: the corner of the angle at ${row},${col} is open on its ${dr},${dc} side`);
      }
      if (!cell.ceiling) wantedCaps++;
    }
    assert.ok(checked > 500, `${mifName}: ${checked} seam samples were walked`);
    assert.ok(wantedPrism > 20, `${mifName}: ${wantedPrism} corner faces were asked for`);
    assert.equal(prismFaces, wantedPrism,
      `${mifName}: every solid half is a closed mass, not a slab (${prismFaces} of ${wantedPrism})`);
    // …and under open sky the corner is capped, or the mass is a well you can see into.
    const capped = diagonals.filter(({ row, col }) => !at(row, col).ceiling && caps.has(`${row},${col}`)).length;
    assert.equal(capped, wantedCaps, `${mifName}: every open-sky corner is capped (${capped} of ${wantedCaps})`);
  }
});

test('a settlement keeps its gate open: the pass walls a city everywhere but its opening', async () => {
  // Sealing the ring must not undo the owner's earlier request (*"CITY GATES SHOULD HAVE NO COLLISION
  // SO I CAN ACTUALLY GO INTO THE WILDERNESS"*): the two cells `openSettlementGate` marks are
  // **skipped** by the boundary pass, so the way out of a city is still a way out.
  // A settlement skeleton names no `.INF` of its own (the city builder hands it one), so the
  // architecture is read by name, exactly as the gate test above does.
  const mif = await data.mif('CITY1.MIF');
  const inf = await data.inf('TCN.INF');
  const level = decodeLevel(mif.levels[0], inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  const gates = openSettlementGate(level);
  assert.ok(gates.filter((g) => ((level.cells[g.row * level.width + g.col].rawMap1 & 0xf000) >> 12) === 0x9).length === 2,
    'CITY1 cuts one two-cell arch (and paints its doors as well — D-93)');
  const built = buildLevelMesh(level, { boundaryWalls: true });
  const collider = new Collider();
  collider.addMesh('level', built.collider.positions, built.collider.indices, identity());
  for (const gate of gates) {
    const x = (gate.row + 0.5) * CELL_SIZE;
    const z = (gate.col + 0.5) * CELL_SIZE;
    const dir = gate.axis === 'north' ? [-1, 0] : gate.axis === 'south' ? [1, 0] : gate.axis === 'west' ? [0, -1] : [0, 1];
    const hit = collider.raycast([x, (level.floorY + 0.5) * CELL_SIZE, z], [dir[0], 0, dir[1]], CELL_SIZE * 1.4);
    assert.ok(!Number.isFinite(hit), `the ${gate.axis} gate at ${gate.row},${gate.col} is walled shut by the boundary pass`);
  }
});

// ------------------------------------------------------- the stair's other half ----
// D-53: a crypt's deeper storey is drawn with its own `*LEVELUP` stair and its own roster, but
// the floor above carries **no down stair**, so nothing a player can do reaches it. The pair is
// completed from the data's own half (`mifLevel.fillStairPair`): the lower level's stair cell,
// this level's own `*LEVELDOWN` art, and a wall of this level beside it.
test('the stairway a crypt never draws above is completed from the floor below', async () => {
  const inf4 = await data.inf('WCRYPT.INF');
  const below4 = await data.inf('CRYPT2.INF');
  const crypt = await data.mif('WCRYPT4.MIF');
  const filled = fillStairPair({
    map1: crypt.levels[0].map1, inf: inf4,
    belowMap1: crypt.levels[1].map1, belowInf: below4, width: crypt.width,
  });
  assert.ok(filled, 'WCRYPT4 level 0 has no down stair of its own, so one is filled');
  assert.deepEqual(filled.at.map((cell) => `${cell.row},${cell.col}`), ['17,4'],
    'the cell is the lower stair\'s own neighbourhood, and the same answer every time');
  assert.deepEqual(filled.at[0].from, { row: 18, col: 3 }, 'the lower level names where the pair starts');
  // What was written is this level's own art, in the wall voxel's two-byte form — and it decodes
  // as a `down` stair, which is what `stairKindOf` (and therefore `E`) reads.
  const stamped = filled.map1[17 * crypt.width + 4];
  assert.equal(stamped >> 8, inf4.levelDownIndex + 1);
  const level = decodeLevel({ ...crypt.levels[0], map1: filled.map1 }, inf4,
    { width: crypt.width, depth: crypt.height, mapType: 'interior' });
  assert.equal(level.cells[17 * crypt.width + 4].stair, 'down');
  assert.equal(level.cells.filter((cell) => cell.stair === 'down').length, 1);
  // The board is not mutated: the archive's own bytes stay the archive's.
  assert.notEqual(crypt.levels[0].map1[17 * crypt.width + 4], stamped);
});

test('a stairway that is already whole is left exactly as the file drew it', async () => {
  const tower = await data.mif('TOWER1.MIF');
  const towerInf = await data.inf('TOWER1.INF');
  assert.equal(fillStairPair({
    map1: tower.levels[0].map1, inf: towerInf,
    belowMap1: tower.levels[1].map1, belowInf: await data.inf('TOWER1.INF'), width: tower.width,
  }), null, 'a tower descends on its own, and must not gain a second stair into the same floor');
  const noble = await data.mif('NOBLE1.MIF');
  assert.equal(fillStairPair({
    map1: noble.levels[1].map1, inf: await data.inf('BS1.INF'),
    belowMap1: noble.levels[2].map1, belowInf: await data.inf('BS1.INF'), width: noble.width,
  }), null, 'a noble house\'s pair is complete');
  // …and a single-storey room in a two-level file is not given a stair it never had.
  const tavern = await data.mif('TAVERN2.MIF');
  assert.equal(fillStairPair({
    map1: tavern.levels[0].map1, inf: await data.inf('TAVERN.INF'),
    belowMap1: tavern.levels[1].map1, belowInf: await data.inf('TAVERN.INF'), width: tavern.width,
  }), null);
});

test('every crypt in the archive can be walked down from its own entrance', async () => {
  const rows = [];
  for (let i = 1; i <= 8; i++) {
    const mif = await data.mif(`WCRYPT${i}.MIF`);
    const filled = fillStairPair({
      map1: mif.levels[0].map1, inf: await data.inf(mif.levels[0].info),
      belowMap1: mif.levels[1].map1, belowInf: await data.inf(mif.levels[1].info), width: mif.width,
    });
    assert.ok(filled, `WCRYPT${i} level 0 must reach level 1`);
    const distance = Math.hypot(filled.at[0].row - filled.at[0].from.row, filled.at[0].col - filled.at[0].from.col);
    assert.ok(distance <= 3, `WCRYPT${i}: the stair lands within three cells of the floor below's (${distance})`);
    rows.push(`WCRYPT${i}:${filled.at[0].row},${filled.at[0].col}`);
  }
  assert.equal(rows.length, 8);
});

test('a raised platform\u2019s sides are cut out \u2014 the 3D tables and beds \u2014 while a wall keeps its own law', async () => {
  // The owner, 2026-10-18: *"not the small 2d tables the 3d tables … this tables and beds have
  // black in their textures that should be invisible so i can see under them"*. A house's
  // furniture is a **raised box**: a table is the box whose `*BOXSIDE` art is `TABLE.IMG` and a
  // bed the one whose art is `BED.IMG`, and those records are pictures with the room showing
  // through them (`TABLE.IMG` 37.1% palette index 0, `BED.IMG` 84.9%, measured). OpenTESArena's
  // own renderer alpha-tests exactly those faces (`MapGeneration.cpp`, `writeVoxelInfoForMAP1`:
  // a raised platform's sides are `FragmentShaderType::AlphaTested` and its top and bottom
  // `Opaque`, while a solid wall's three faces are all `Opaque`). So the treatment is the
  // kind's, not the file's — and the sharpest way to hold that is **the same art on both
  // kinds**: one bucket must come out cut, the other must not.
  const inf = await data.inf('TAVERN.INF');
  const art = inf.voxelTextures.findIndex((t) => t.filename === 'TABLE.IMG' && t.setIndex < 0);
  const cap = inf.voxelTextures.findIndex((t) => t.filename === 'IFLOOR4.IMG' && t.setIndex < 0);
  assert.ok(art >= 0 && cap >= 0, 'TAVERN.INF binds TABLE.IMG as a box side and IFLOOR4.IMG as a cap');
  const cell = (kind) => ({
    x: 0, z: 0, floor: { texture: 0, flatIndex: -1, chasm: null }, kind,
    sideTexture: art, capTexture: cap, bottomTexture: -1,
    yOffset: 0, ySize: 0.25, facing: -1, doorKind: null, solid: true,
    entityFlatIndex: -1, ceiling: true, ceilingTexture: 0, rawFlor: 0, rawMap1: 0, rawMap2: 0,
  });
  const built = buildLevelMesh({
    width: 2, depth: 1, ceilingScale: 1, layerCount: 3, floorY: 1, ceilingY: 2,
    outdoors: false, inf, startPoints: [], spawn: null, stats: {},
    cells: [cell('raised'), cell('wall')],
  });
  const buckets = new Map(built.model.subMeshes.map((s) => [s.key, s.cutout]));
  assert.equal(buckets.get('TABLE.IMG#-1#cut'), true, 'the raised platform\u2019s sides are cut out');
  assert.equal(buckets.get('TABLE.IMG#-1'), false, 'the wall draws the same art opaque');
  assert.equal(buckets.get('IFLOOR4.IMG#-1'), false, 'and the platform\u2019s top stays opaque');

  // **Measured against the install**: TAVERN1's main hall is 19 such tables and BS1's upper floor
  // is the house's two beds, and each one's sides are the *cut* bucket \u2014 the bucket that used to
  // be an opaque black slab standing in the room.
  const tavern = await data.mif('TAVERN1.MIF');
  const hall = decodeLevel(tavern.levels[1], await data.inf(tavern.levels[1].info),
    { width: tavern.width, depth: tavern.height, mapType: 'interior' });
  const tables = hall.cells.filter((c) => c.kind === 'raised' && c.sideTexture === art);
  assert.equal(tables.length, 19, `TAVERN1\u2019s hall carries ${tables.length} 3D tables, not 19`);
  const hallMesh = buildLevelMesh(hall);
  assert.ok(hallMesh.model.subMeshes.some((s) => s.key === 'TABLE.IMG#-1#cut' && s.cutout));
  assert.ok(!hallMesh.model.subMeshes.some((s) => s.key === 'TABLE.IMG#-1'),
    'no face of the hall draws the table art opaque');

  const house = await data.mif('BS1.MIF');
  const upstairs = decodeLevel(house.levels[1], await data.inf(house.levels[1].info),
    { width: house.width, depth: house.height, mapType: 'interior' });
  const bedArt = upstairs.inf.voxelTextures.findIndex((t) => t.filename === 'BED.IMG' && t.setIndex < 0);
  assert.equal(upstairs.cells.filter((c) => c.kind === 'raised' && c.sideTexture === bedArt).length, 2,
    'the house\u2019s bedroom has its two beds');
  const houseMesh = buildLevelMesh(upstairs);
  assert.ok(houseMesh.model.subMeshes.some((s) => s.key === 'BED.IMG#-1#cut' && s.cutout));
  assert.ok(!houseMesh.model.subMeshes.some((s) => s.key === 'BED.IMG#-1'),
    'a bed\u2019s frame is a picture with a hole, never an opaque slab');
});

test('a hedge is a box made of a picture with holes: ground under it, and no lid over it', async () => {
  // The owner, 2026-10-21: *"every time there is a wall that uses the texture AR-sprite-NHEDGE
  // and AR-sprite-NHEDGED … i see a hole in the world you should allow ground below them"*. He is
  // right about the geometry: a hedge is a `0x9` **transparent** voxel drawn as four cut-out
  // sides and nothing else — no floor (the mesher skipped it under a "box") and no lid
  // (OpenTESArena's `TransparentWall` has neither a top nor a bottom face). First person never
  // sees either hole; a third-person camera looks over the hedge into an open-ended box whose
  // inner faces are culled, and down through its 2%-transparent art onto nothing.
  //
  // The fix is the ground the original's own `FLOR` layer keeps under every cell — **and only
  // that**. This test first demanded a lid, and the owner rejected the lid on sight (2026-10-21):
  // *"REMOVE THE WALL ABOVE THEM THAT YOU CREATED IT LOOKS UGLY AND IT SHOULDNT BE THERE"*. So
  // the check now holds both halves of the corrected law: every hedge has a floor, and **no**
  // open-topped hedge has a cap in the hedge's own art. `TOWN3.MIF` under `TCN.INF` is a
  // settlement with a hedge maze in it.
  const mif = await data.mif('TOWN3.MIF');
  const raw = mif.levels[0];
  const inf = await data.inf('TCN.INF');
  const level = decodeLevel(raw, inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  const isHedge = (c) => c.kind === 'transparent'
    && /NHEDGED?(?:\.IMG)?$/i.test(cellTexture(c, 'side', inf)?.filename ?? '');
  const hedges = level.cells.filter(isHedge);
  assert.ok(hedges.length > 100, `${hedges.length} hedge cells in TOWN3.MIF`);
  const openTopped = hedges.filter((c) => !c.ceiling);

  const built = buildLevelMesh(level, { upperStoreys: true });
  assert.equal(built.stats.hedgeCaps, undefined,
    'the mesher no longer reports a hedge lid: there is none to report');
  // Every hedge's **own** floor and cap, read out of the mesh: an up-facing quad whose four
  // corners are the cell's own square, at the floor plane and at the wall's top.
  const S = CELL_SIZE;
  const floorY = level.floorY * S;
  const topY = level.ceilingY * S;
  const { positions: p, normals: n, indices } = built.model;
  const quadsAt = (y) => {
    const out = new Map();
    for (let t = 0; t + 5 < indices.length; t += 6) {
      const v = [indices[t], indices[t + 1], indices[t + 2], indices[t + 3], indices[t + 4], indices[t + 5]];
      if (!v.every((i) => Math.abs(n[i * 3 + 1] - 1) < 1e-3 && Math.abs(p[i * 3 + 1] - y) < 1e-3)) continue;
      const xs = v.map((i) => p[i * 3]);
      const zs = v.map((i) => p[i * 3 + 2]);
      out.set(`${Math.min(...xs) / S},${Math.min(...zs) / S}`, (out.get(`${Math.min(...xs) / S},${Math.min(...zs) / S}`) ?? 0) + 1);
    }
    return out;
  };
  const floors = quadsAt(floorY);
  const lids = quadsAt(topY);
  let missingFloor = 0;
  let missingLid = 0;
  for (let i = 0; i < level.cells.length; i++) {
    if (!isHedge(level.cells[i])) continue;
    const row = Math.floor(i / level.width);
    const col = i % level.width;
    if (!floors.has(`${row},${col}`)) missingFloor++;
    if (!level.cells[i].ceiling && !lids.has(`${row},${col}`)) missingLid++;
  }
  assert.equal(missingFloor, 0, `${missingFloor} hedge cells have no floor under them`);
  assert.equal(openTopped.filter((cell) => {
    const index = level.cells.indexOf(cell);
    return lids.has(`${Math.floor(index / level.width)},${index % level.width}`);
  }).length, 0, `${openTopped.length} open-topped hedges, none with a lid`);
});
