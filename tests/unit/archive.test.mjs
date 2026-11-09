// **THE ARCHIVE DOOR** (2026-10-22).
//
// The owner: *"in opera and other browser you cant load .rars of the gamefiles so you cant load
// the gamefiles at all because opera doesnt let you use all the folder"*. A browser that will not
// hand a directory to a file dialog takes a single `.zip` or `.rar` on every platform, and both
// are unpacked into the same `ArenaSource` a picked folder builds.
//
// The zip is written here (a stored entry, a deflated one, a directory, a Mac shadow), so the
// reader is checked against a real central directory rather than a mock. The rar is a real
// archive (`tests/fixtures/foldertest.rar`) read through the vendored unrar wasm.
//
//   node --test tests/unit/archive.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { deflateRawSync } from 'node:zlib';

import { archiveSource, indexEntries, looksLikeArchiveName } from '../../src/arena/archiveSource.js';
import { readRar } from '../../src/arena/rarArchive.js';
import { readZip } from '../../src/arena/zipArchive.js';
import { looksLikeArena } from '../../src/arena/browserSource.js';

/** CRC-32, as a zip stores it. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Write a zip the way an archiver does: local header + payload per file, then the central
 * directory, then the end record.
 *
 * @param {{name: string, data: string|Uint8Array, store?: boolean}[]} entries
 * @returns {Uint8Array}
 */
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const raw = typeof entry.data === 'string' ? new TextEncoder().encode(entry.data) : entry.data;
    const body = entry.store ? raw : new Uint8Array(deflateRawSync(raw));
    const method = entry.store ? 0 : 8;
    const crc = crc32(raw);

    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);              // version needed
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);              // version made by
    cv.setUint16(6, 20, true);              // version needed
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(offset + cdSize + 22);
  let at = 0;
  for (const l of locals) { out.set(l, at); at += l.length; }
  for (const c of centrals) { out.set(c, at); at += c.length; }
  const ev = new DataView(out.buffer);
  ev.setUint32(at, 0x06054b50, true);
  ev.setUint16(at + 8, centrals.length, true);
  ev.setUint16(at + 10, centrals.length, true);
  ev.setUint32(at + 12, cdSize, true);
  ev.setUint32(at + 16, offset, true);
  return out;
}

const wasmFromDisk = async () => fs.readFileSync('src/vendor/unrar/unrar.wasm');

test('a .zip of the ARENA folder is an install, read the way a picked folder is', async () => {
  const zip = makeZip([
    { name: 'ARENA/', data: '' },                                     // a directory entry
    { name: 'ARENA/GLOBAL.BSA', data: 'archive-bytes', store: true },
    { name: 'ARENA/CAS.INF', data: 'inf-bytes'.repeat(200) },          // deflated
    { name: 'ARENA/SPEECH/1400_00A.VOC', data: 'speech-bytes', store: true },
    { name: '__MACOSX/ARENA/._GLOBAL.BSA', data: 'junk', store: true },
  ]);
  const source = await archiveSource(new File([zip], 'ARENA.zip'));
  assert.equal(looksLikeArena(source), true, 'GLOBAL.BSA is what makes it an install');
  const bytes = await source.getBytes('global.bsa');
  assert.equal(new TextDecoder().decode(bytes), 'archive-bytes', 'the archive’s own bytes');
  const inf = await source.getBytes('CAS.INF');
  assert.equal(inf.length, 'inf-bytes'.length * 200, 'a deflated entry decodes to its promised size');
  assert.equal(await source.getBytes('SPEECH/1400_00A.VOC') && 'ok', 'ok', 'a nested path resolves');
  assert.ok((await source.getBytes('1400_00A.VOC'))?.length, 'and its bare 8.3 name resolves too');
  assert.equal(await source.getBytes('._GLOBAL.BSA'), null, 'a Mac shadow file is not a game file');
  assert.equal(await source.getBytes('NOPE.MIF'), null);
});

test('an archive that holds no GLOBAL.BSA says what is wrong', async () => {
  const zip = makeZip([{ name: 'SCREENS/INTRO.IMG', data: 'x' }]);
  await assert.rejects(() => archiveSource(new File([zip], 'SCREENS.zip')), /no GLOBAL\.BSA/);
});

test('the archive is recognised by its bytes, not by the name it was given', async () => {
  const zip = makeZip([{ name: 'GLOBAL.BSA', data: 'archive-bytes' }]);
  const source = await archiveSource(new File([zip], 'misnamed.rar'));
  assert.equal(looksLikeArena(source), true, 'a zip downloaded as .rar still boots');
  await assert.rejects(() => archiveSource(new File(['hello'], 'ARENA.zip')), /not a \.zip or \.rar/);
  assert.equal(looksLikeArchiveName('ARENA.RAR'), true);
  assert.equal(looksLikeArchiveName('ARENA.folder'), false);
});

test('a .rar is unpacked through the vendored decoder', async () => {
  const bytes = new Uint8Array(fs.readFileSync('tests/fixtures/foldertest.rar'));
  const files = await readRar(bytes, { loadWasm: wasmFromDisk });
  const names = Array.from(files.keys());
  // The fixture's own tree: a folder with a space in it, and one with non-ASCII in it.
  assert.deepEqual(names, ['Folder1/Folder Space/long.txt', 'Folder1/Folder 中文/2中文.txt']);
  assert.equal(files.get('Folder1/Folder Space/long.txt').length, 1049076, 'a deflated record decompresses');
  const small = new TextDecoder().decode(files.get('Folder1/Folder 中文/2中文.txt'));
  assert.equal(small.length > 0, true, 'and its bytes are real');
});

test('a rar’s nested paths are flattened to the 8.3 names the game asks for', async () => {
  const bytes = new Uint8Array(fs.readFileSync('tests/fixtures/foldertest.rar'));
  const indexed = indexEntries(await readRar(bytes, { loadWasm: wasmFromDisk }));
  assert.ok(indexed.has('LONG.TXT'), 'a bare name is indexed from a nested path');
  assert.ok(indexed.has('FOLDER SPACE/LONG.TXT'),
    'and the path inside the archive’s single root — `Folder1/` is the folder that was archived');
  assert.equal(indexed.get('2中文.TXT').length, indexed.get('FOLDER 中文/2中文.TXT').length);
});

test('a zip’s central directory is read, not guessed at', async () => {
  const zip = makeZip([
    { name: 'A.MIF', data: 'a'.repeat(5000) },
    { name: 'B.MIF', data: 'b', store: true },
  ]);
  const entries = await readZip(zip);
  assert.deepEqual(Array.from(entries.keys()), ['A.MIF', 'B.MIF']);
  assert.equal(new TextDecoder().decode(entries.get('B.MIF')), 'b');
  await assert.rejects(() => readZip(new Uint8Array([1, 2, 3, 4])), /not a zip archive/);
});
