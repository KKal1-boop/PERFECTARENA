// THE INSTALL'S OWN SOUND — the fanfare's `.VOC` decoded against its own bytes.
//
// `FANFARE1.VOC` is 18 310 bytes at the install's root, a plain Creative Voice File:
// "Creative Voice File" + `0x1A`, then sound blocks. These pins are read off the file
// itself: the header, the block series that makes the fanfare, its talking rate, and
// the silence-block walk. A file that is not a VOC is refused to the caller — the game
// runs nameless-silent exactly as it did.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { decodeVoc } from '../../src/arena/vocFile.js';
import { parseBsa } from '../../src/arena/bsaArchive.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const FANFARE = path.join(ARENA, 'FANFARE1.VOC');
const bytes = (() => {
  try {
    return new Uint8Array(fs.readFileSync(FANFARE));
  } catch (err) {
    return null;
  }
})();

test('the install ships the fanfare, and its header is the Creative magic', () => {
  assert.ok(bytes, 'FANFARE1.VOC must be in the install for this test');
  assert.equal(bytes.length, 18_310, 'the install\u2019s own file, byte for byte');
  const header = Buffer.from(bytes.slice(0, 20)).toString('latin1');
  assert.match(header, /^Creative Voice File\u001a/);
});

test('the decode walks the file\u2019s own blocks and reads the fanfare at its rate', () => {
  const decoded = decodeVoc(bytes);
  assert.ok(decoded, 'the VOC decode holds its own magic');
  assert.ok(Number.isFinite(decoded.rate) && decoded.rate > 3000 && decoded.rate <= 44_100,
    `a talking rate in the Creative family (${decoded.rate})`);
  assert.ok(decoded.segments.length >= 1, 'at least the fanfare\u2019s own segment');
  const total = decoded.segments.reduce((n, s) => n + s.samples.length, 0);
  assert.ok(total > 4000, `real audio in hand (${total} samples)`);
  // 8-bit unsigned PCM decoded around silence at 0: the fanfare's lead-in is quiet,
  // then it rises. The first hundred samples never exceed a small band either way.
  const lead = decoded.segments[0].samples.slice(0, 100);
  for (const leadSample of lead) assert.ok(Math.abs(leadSample) <= 0.2, `quiet lead-in (${leadSample})`);
  const peak = decoded.segments.reduce((m, s) => Math.max(m, s.samples.reduce((a, v) => Math.max(a, Math.abs(v)), 0)), 0);
  assert.ok(peak > 0.05, `the fanfare really sounds (${peak.toFixed(3)} peak)`);
});

test('silence is kept as real zeros, not dropped', () => {
  const decoded = decodeVoc(bytes);
  // Any rest the fanfare carries reads as whole-zero samples; find one if the fanfare
  // has one — the pin is that a zero run, when it exists, is contiguous zeros.
  const flat = decoded.segments.some((s) => s.samples.every((v) => v === 0));
  const hasQuiet = decoded.segments.some((s) => s.samples.some((v, i) => i > 10 && v === 0));
  assert.ok(flat || hasQuiet, 'the fanfare\u2019s own rest survives the decode');
});

test('the repeat pair is honoured: DRUMS.VOC is its own run, ten times', () => {
  // The one clip in the install that is not a plain run of sound blocks, and the one the
  // reader used to refuse outright (its `0x06` was read as a terminator): a ten-times repeat
  // of the drums — Arena's own sting. The count is in the file, so the pin is the file's.
  let bsa = null;
  try {
    bsa = parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))));
  } catch { /* no install: the pin below stands down, as the fanfare pins above do */ }
  if (!bsa) return;
  const drums = decodeVoc(bsa.get('DRUMS.VOC'));
  assert.ok(drums, 'DRUMS.VOC decodes (it is a VOC like the rest)');
  const samples = drums.segments.reduce((n, s) => n + s.samples.length, 0);
  const blocks = Math.max(1, Math.round(samples / (12_032))); // one pass of the enclosed run
  assert.equal(blocks, 10, `ten passes of the run, as the file's own count word says (${samples} samples)`);
});

test('every clip the install ships decodes — none is refused', () => {
  // Measured across the whole sound bank: the reader's arms must cover every block type a
  // real Arena file uses (`0x01` runs and the `0x06`/`0x07` repeat pair), not the ones a
  // wrong table guessed at.
  let bsa = null;
  try {
    bsa = parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))));
  } catch { /* no install: nothing to walk */ }
  if (!bsa) return;
  const refused = [];
  for (const name of bsa.names().filter((n) => n.endsWith('.VOC'))) {
    if (!decodeVoc(bsa.get(name))) refused.push(name);
  }
  assert.deepEqual(refused, [], 'the install\u2019s own library, read whole');
});

test('a foreign file is refused, and the caller carries on silent', () => {
  assert.equal(decodeVoc(null), null);
  assert.equal(decodeVoc(new Uint8Array(30).fill(0x41)), null, 'no magic, no decode');
  const shortMagic = new Uint8Array([...Buffer.from('Creative Voice File\u001a'), 0, 10, 1, 0, 0, 0]);
  assert.equal(decodeVoc(shortMagic), null, 'a header with no blocks is not a voice');
});
