// THE SECOND DOOR TO THE GAME FILES (2026-10-22).
//
// The owner: *"in opera and other browser … opera doesnt let you use all the folder"* — a file
// dialog that will not hand over a directory ends the boot, because the picker's `webkitdirectory`
// input is the shipping door. A folder **dropped on the page** is the other one: Chromium's
// `DataTransferItem.webkitGetAsEntry` walks a dropped directory, and the same `ArenaSource` is
// built from it.
//
//   node --test tests/unit/browsersource.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { droppedFolderSource, fileListSource, looksLikeArena } from '../../src/arena/browserSource.js';

/** One dropped file, shaped like a `FileSystemFileEntry`. */
const fileEntry = (name, body = 'x') => ({
  isFile: true,
  isDirectory: false,
  file: (resolve) => resolve(new File([body], name)),
});

/** One dropped directory, shaped like a `FileSystemDirectoryEntry`; `page` entries per read. */
const dirEntry = (children, page = 2) => ({
  isFile: false,
  isDirectory: true,
  createReader() {
    let at = 0;
    return {
      readEntries(resolve) {
        const batch = children.slice(at, at + page);
        at += page;
        resolve(batch);
      },
    };
  },
});

test('a dropped folder becomes the same source a picker makes', async () => {
  const folder = dirEntry([
    fileEntry('GLOBAL.BSA', 'archive-bytes'),
    dirEntry([fileEntry('SPEECH/1400_00A.VOC', 'speech-bytes')]),
  ], 1);
  const source = await droppedFolderSource({ items: [{ webkitGetAsEntry: () => folder }] });
  assert.ok(source, 'a dropped folder is a source');
  assert.equal(looksLikeArena(source), true, 'GLOBAL.BSA is what makes it an install');
  assert.deepEqual(source.list(), ['1400_00A.VOC', 'GLOBAL.BSA'], '8.3 names, flattened from the subfolder');
  const bytes = await source.getBytes('global.bsa');
  assert.equal(new TextDecoder().decode(bytes), 'archive-bytes', 'and the bytes are the dropped file’s');
  assert.equal(await source.getBytes('NOPE.MIF'), null);
});

test('a reader that answers in pages is asked again until it is empty', async () => {
  // The real `readEntries` hands back at most 100 entries per call; this one hands back two.
  const names = ['A.MIF', 'B.MIF', 'C.MIF', 'D.MIF', 'E.MIF'];
  const folder = dirEntry(names.map((n) => fileEntry(n)), 2);
  const source = await droppedFolderSource({ items: [{ webkitGetAsEntry: () => folder }] });
  assert.deepEqual(source.list(), names, 'every page of the directory is walked');
});

test('a drop that holds nothing is answered, not thrown at', async () => {
  assert.equal(await droppedFolderSource({ items: [] }), null);
  assert.equal(await droppedFolderSource(null), null);
  // A browser with no entry API still fills `files` for a dropped folder; a plain FILE drop is
  // not an install, and the check is `GLOBAL.BSA`, not the file count.
  const one = await droppedFolderSource({ files: [new File(['x'], 'ARENA.RAR')] });
  assert.equal(looksLikeArena(one), false, 'an archive dropped as a file is not a folder of files');
});

test('a FileList with no directory prefix is indexed by its 8.3 name', async () => {
  const source = fileListSource([new File(['bytes'], 'START.MIF')]);
  assert.deepEqual(source.list(), ['START.MIF']);
  assert.equal(new TextDecoder().decode(await source.getBytes('start.mif')), 'bytes');
});
