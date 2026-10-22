// THE DREAM'S SPEECH — `.VOC` lengths, caption pacing, and the narration's measured length.
//
// The VOC reader is pinned on bytes built here, so the arithmetic is checked without the install.
// The stored clip lengths in `arena/dreamSpeech.js` are checked against the install's own
// `SPEECH/` clips whenever `ARENA_PATH` points at one.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { vocSeconds } from '../../src/arena/vocFile.js';
import { DREAM_NARRATION_SECONDS, DREAM_NARRATION_MS } from '../../src/arena/dreamSpeech.js';
import { captionStarts } from '../../src/game/cutscene.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const SPEECH = path.join(ARENA, 'SPEECH');

/** A VOC file with the given blocks, each `[type, bodyBytes]`, then the terminator. */
function voc(blocks) {
  const signature = Buffer.from('Creative Voice File\u001a', 'latin1');
  const header = Buffer.alloc(26);
  signature.copy(header, 0);
  header.writeUInt16LE(26, 20); // header size: the first block starts at 26
  header.writeUInt16LE(0x010a, 22);
  const parts = [header];
  for (const [type, body] of blocks) {
    const len = body.length;
    parts.push(Buffer.from([type, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff]), Buffer.from(body));
  }
  parts.push(Buffer.from([0]));
  return new Uint8Array(Buffer.concat(parts));
}

test('a sound block of 8000 samples at 8 kHz is one second', () => {
  // Divisor 131 is 8 kHz: 256 - 131 = 125, and 1e6 / 125 = 8000 samples a second.
  const samples = new Array(8000).fill(128);
  const bytes = voc([[0x01, [131, 0, ...samples]]]);
  assert.ok(Math.abs(vocSeconds(bytes) - 1) < 1e-9);
});

test('continuation blocks add their samples at the rate of the block before', () => {
  const first = [131, 0, ...new Array(4000).fill(128)]; // half a second
  const more = new Array(4000).fill(128); // another half second, at the same rate
  const bytes = voc([[0x01, first], [0x02, more]]);
  assert.ok(Math.abs(vocSeconds(bytes) - 1) < 1e-9);
});

test('something that is not a VOC file is not read as one', () => {
  assert.equal(vocSeconds(new Uint8Array(40).fill(7)), null);
  assert.equal(vocSeconds(null), null);
});

test('the dream narration is the sum of its clips, about 133 seconds', () => {
  assert.equal(DREAM_NARRATION_SECONDS.length, 21);
  assert.ok(Math.abs(DREAM_NARRATION_MS - 133258) <= 2);
});

test('the stored clip lengths are the install\u2019s own, when the install is here', { skip: !fs.existsSync(SPEECH) && 'no SPEECH folder' }, () => {
  const names = fs.readdirSync(SPEECH).filter((n) => /^1400_\d\d[AB]\.VOC$/i.test(n)).sort();
  assert.equal(names.length, DREAM_NARRATION_SECONDS.length);
  names.forEach((name, i) => {
    const measured = vocSeconds(new Uint8Array(fs.readFileSync(path.join(SPEECH, name))));
    assert.ok(Math.abs(measured - DREAM_NARRATION_SECONDS[i]) < 0.001, `${name}: ${measured}`);
  });
});

test('captions start in order, the first at zero, each taking a share of the narration by its length', () => {
  const captions = ['a'.repeat(10), 'b'.repeat(30), 'c'.repeat(60)];
  const starts = captionStarts(captions, 10000);
  assert.deepEqual(starts, [0, 1000, 4000]);
});

test('with no captions there are no starts, and every start stays inside the narration', () => {
  assert.deepEqual(captionStarts([], 5000), []);
  const captions = Array.from({ length: 17 }, (_, i) => 'x'.repeat(20 + i * 3));
  const starts = captionStarts(captions, DREAM_NARRATION_MS);
  assert.equal(starts[0], 0);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] > starts[i - 1]);
  assert.ok(starts[starts.length - 1] < DREAM_NARRATION_MS);
});
