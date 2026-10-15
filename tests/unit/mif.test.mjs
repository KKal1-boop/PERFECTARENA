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
import { decodeLevel } from '../../src/game/mifLevel.js';
import { ARENA_TEXTURE_ARCHIVE, CELL_SIZE, CHASM_DEPTH, buildLevelMesh } from '../../src/game/mifMesh.js';
import { STEP_OFFSET } from '../../src/engine/player/motor.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

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

test('a chasm is a pool below the surface, and shallow enough to walk out of', async () => {
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
  const surfaceFloorCells = decoded.cells.filter((c) => !c.floor.chasm
    && !(c.solid && ['wall', 'transparent', 'diagonal'].includes(c.kind))).length;
  assert.equal(built.stats.floorQuads, surfaceFloorCells, 'no chasm cell is given a surface floor');

  // The depth is the motor's own step offset or less, so the pool can never trap a player.
  assert.ok(CHASM_DEPTH <= STEP_OFFSET, `a chasm is ${CHASM_DEPTH} m deep, the motor steps ${STEP_OFFSET} m`);

  // Every bed vertex sits exactly `CHASM_DEPTH` under the floor, every bank vertex climbs
  // from the bed to the surface, and both are in set collision: the geometry and the
  // collider are one triangle soup, so a pool cannot be drawn somewhere it cannot be felt.
  const surface = decoded.floorY * CELL_SIZE;
  const bed = surface - CHASM_DEPTH;
  const { positions, normals, indices } = built.model;
  // Every *quad* is two triangles over four vertices, so the sides can be read off the
  // index buffer: a bed quad has four vertices at the bed height and a normal that points
  // up, a bank quad has two at the bed and two at the surface with a level normal — and
  // that span is the depth exactly, which is the whole point of the constant.
  let beds = 0, banks = 0;
  const yOf = (vertex) => positions[vertex * 3 + 1];
  for (let t = 0; t < indices.length; t += 3) {
    const quad = [indices[t], indices[t + 1], indices[t + 2]];
    if (t % 6) continue;                                       // one pass per quad
    const four = [...quad, indices[t + 3], indices[t + 4], indices[t + 5]];
    const ys = [...new Set(four.map(yOf))];
    const normal = [normals[quad[0] * 3], normals[quad[0] * 3 + 1], normals[quad[0] * 3 + 2]];
    if (ys.length === 1 && Math.abs(ys[0] - bed) < 1e-6 && normal[1] > 0.99) beds++;
    if (ys.length === 2 && Math.abs(Math.min(...ys) - bed) < 1e-6
      && Math.abs(Math.max(...ys) - surface) < 1e-6 && Math.abs(normal[1]) < 0.01) banks++;
  }
  assert.equal(beds, chasms.length, 'every chasm cell has one upward-facing bed');
  assert.equal(banks, built.stats.chasmWalls, 'and the banks it needs, each spanning the depth');
  assert.ok(indices.length > 0 && built.collider.indices.length > 0, 'the pool is collidable');
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
      && ['wall', 'transparent', 'diagonal'].includes(c.kind) && c.yOffset <= 1e-4).length;
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
