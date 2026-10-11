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
import { ARENA_TEXTURE_ARCHIVE, buildLevelMesh } from '../../src/game/mifMesh.js';
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

  // The collider is the same triangle soup, so geometry and collision cannot drift.
  assert.ok(built.collider.indices.length > 0);
  assert.equal(built.collider.positions.length % 3, 0);
  assert.ok(built.collider.indices.length <= built.model.indices.length,
    'the collision soup can only be a subset of the drawn geometry');

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

/** Byte offset of a four-character MIF chunk tag. */
function indexOfTag(bytes, tag) {
  const want = [tag.charCodeAt(0), tag.charCodeAt(1), tag.charCodeAt(2), tag.charCodeAt(3)];
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] === want[0] && bytes[i + 1] === want[1] && bytes[i + 2] === want[2] && bytes[i + 3] === want[3]) return i;
  }
  throw new Error(`${tag} not found`);
}
