// THE INSTALL'S OWN MOVIES — `game/cutscene.js` against the real `.FLC` bytes.
//
// Every pin here reads the install's own file: the catalogue's names must exist, the header
// must be the one Arena wrote (320×200, 8 bpp), the frame count and the pacing must come from
// the header rather than from a constant in this project, and a decoded frame must carry real
// art — not a black buffer that "decoded successfully". `JAGAR.FLC` is the small one (25 KB,
// 28 frames), so a whole walk through it is cheap; `INTRO.FLC` is 1.5 MB and is only opened
// far enough to prove the big ones load.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { CUTSCENES, cutsceneByName, cutsceneNames, decodeCutscene, frameBytes } from '../../src/game/cutscene.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const file = (name) => path.join(ARENA, name);
const bytesOf = (name) => (fs.existsSync(file(name)) ? new Uint8Array(fs.readFileSync(file(name))) : null);

const SMALL = 'JAGAR.FLC';
const small = bytesOf(SMALL);

test('every movie the catalogue names is in this install', () => {
  const missing = cutsceneNames().filter((name) => !fs.existsSync(file(name)));
  assert.deepEqual(missing, [], 'the install ships every `.FLC` the catalogue lists');
  // …and a bare word resolves the way the dev door's `?cutscene=intro` does.
  assert.equal(cutsceneByName('intro').file, 'INTRO.FLC');
  assert.equal(cutsceneByName('END01').file, 'END01.FLC');
  assert.equal(cutsceneByName('nonsense'), null);
  assert.ok(CUTSCENES.every((c) => c.beat && c.what), 'each one carries the beat it belongs to');
});

test('a movie decodes to the header Arena wrote, with the file’s own pacing', () => {
  if (!small) return; // no install: stand down like the other install-pinned units
  const movie = decodeCutscene(small, SMALL);
  assert.ok(movie.ok, movie.reason ?? 'decodes');
  assert.equal(movie.width, 320);
  assert.equal(movie.height, 200);
  assert.equal(movie.frameCount, 28, 'the header’s own frame count');
  // 128 ms in the header, through the reader's own law (ms / 1000 → seconds → ×1000).
  assert.equal(Math.round(movie.delayMs), 128);
  assert.equal(Math.round(movie.totalMs), 128 * 28);
  assert.equal(movie.beat, 'tharn');
});

test('the frames are really walked: in order, one at a time, and not forever', () => {
  if (!small) return;
  const movie = decodeCutscene(small, SMALL);
  const first = movie.next();
  assert.equal(first.index, 0);
  assert.equal(first.width, 320);
  const drawn = first.colours.reduce((n, word) => ((word & 0xffffff) !== 0 ? n + 1 : n), 0);
  assert.ok(drawn > 5000, `the first frame is a picture, not a black buffer (${drawn} lit pixels)`);
  let count = 1;
  let last = null;
  for (;;) {
    const next = movie.next();
    if (!next) break;
    assert.equal(next.index, count, 'frames answer in order');
    count++;
    last = next;
    assert.ok(count <= 28, 'no more frames than the header counts');
  }
  assert.equal(count, 28, 'every frame of the file was answered');
  assert.equal(movie.next(), null, 'and then nothing');
  assert.ok(last.colours.length === 320 * 200);
  // A rewind starts the same walk again from the beginning.
  movie.rewind();
  assert.equal(movie.index(), 0);
  assert.equal(movie.next().index, 0);
});

test('the reader’s RGBA packing unpacks to the bytes a canvas wants', () => {
  const colours = new Uint32Array([0xff203040 >>> 0, 0xff00ff00 >>> 0]);
  const bytes = frameBytes(colours);
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x40, 0x30, 0x20, 0xff]);
  assert.deepEqual(Array.from(bytes.slice(4, 8)), [0x00, 0xff, 0x00, 0xff]);
  // …and a caller may hand its own buffer back, so a player does not allocate per frame.
  const reuse = new Uint8ClampedArray(8);
  assert.equal(frameBytes(colours, reuse), reuse);
});

test('the big opening loads, and a name the install does not ship is refused honestly', () => {
  const intro = bytesOf('INTRO.FLC');
  if (intro) {
    const movie = decodeCutscene(intro, 'INTRO.FLC');
    assert.ok(movie.ok, movie.reason ?? 'the 1.5 MB opening decodes');
    assert.equal(movie.width, 320);
    assert.ok(movie.frameCount > 28, `a movie of its own length (${movie.frameCount} frames)`);
  }
  const refused = decodeCutscene(new Uint8Array(64).fill(0x42), 'NOSUCH.FLC');
  assert.equal(refused.ok, false);
  assert.match(String(refused.reason), /FLIC reader/);
});
