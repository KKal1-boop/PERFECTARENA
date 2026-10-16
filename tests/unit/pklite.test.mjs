// THE EXECUTABLE, UNPACKED (**block B24**).
//
// The owner's ask — *"you need to decompile all of Arena"* — starts here, and it starts with a
// measurement rather than a claim: `ACD.EXE` is PKLITE 1.12 with "extra" and "large" compression,
// its code image is 305 520 bytes, and the image's own structure has to be *coherent* before any
// table is read out of it.
//
// Four kinds of check, in increasing order of what they prove:
//
//   1. **the file says what it is** — the version bytes, the flags, the stream offset the format's
//      table gives, and the copyright string, all read from bytes;
//   2. **the decode lands where the file says it should** — the image is a whole number of
//      paragraphs, and the footer's stack (`SS × 16 + SP`) ends **exactly** at the image's end.
//      These are not properties the decoder can fake: they are what a DOS load image *is*, and a
//      stream that desynchronises by one bit misses both;
//   3. **the table after it parses and ends at the file's own trailer** — 4 044 relocations, then
//      eight footer bytes, then EOF. A wrong stop position makes this run off the end instead;
//   4. **the image is *this game*** — Arena's own words: its races, its province, and the line it
//      prints when it asks the player what class they want.
//
// The real file is used when the install is reachable (`ARENA_PATH`, or the sibling checkout's own
// path) and the four checks above are **skipped** when it is not, because a unit suite that cannot
// run without a commercial game on disk is a suite that lies on somebody else's machine. The pure
// helpers and the refusal path are always checked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { pkliteInfo, unpackPklite, findAscii, findWords } =
  await import('../../src/arena/pklite.js');

const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const acdPath = path.join(arena, 'ACD.EXE');
const haveAcd = fs.existsSync(acdPath);
const skip = haveAcd ? false : `ACD.EXE is not in ${arena}`;
const readAcd = () => new Uint8Array(fs.readFileSync(acdPath));

test('the pure helpers: a string and a word, with the offsets they are at', () => {
  //               M  Z                0x6666   0x4000   0x6666
  const bytes = new Uint8Array([0, 1, 2, 0x4d, 0x5a, 9, 0x66, 0x66, 0x00, 0x40, 0x66, 0x66]);
  assert.equal(findAscii(bytes, 'MZ'), 3);
  assert.equal(findAscii(bytes, 'MZ', 4), -1, 'the search starts where it is told to');
  assert.equal(findAscii(bytes, 'nope'), -1);
  // The threshold pair the wilderness draws with, as consecutive 16-bit words.
  assert.deepEqual(findWords(bytes, [0x6666, 0x4000]), [6]);
  assert.deepEqual(findWords(bytes, [0x6666]), [6, 10], 'a single word matches on its own');
  assert.deepEqual(findWords(bytes, [0x6666, 0x1999]), [], 'a pair that is not there answers nothing');
});

test('a file that is not PKLITE is refused by name, not decoded into nonsense', () => {
  // A bare MZ header with nothing behind it: the shape a wrong guess would try to unpack anyway.
  const fake = new Uint8Array(64);
  fake[0] = 0x4d; fake[1] = 0x5a;
  fake[8] = 4;                        // e_cparhdr = 4 → image at 64, past the file
  const info = pkliteInfo(fake);
  assert.equal(info.pklite, false);
  assert.match(info.why, /version|offset/, `the reason is named: ${info.why}`);
  assert.throws(() => unpackPklite(fake), /not a PKLITE file/);

  // …and a real MZ whose version bytes name a version the format has no offset for.
  const unknown = new Uint8Array(4096);
  unknown[0] = 0x4d; unknown[1] = 0x5a;
  unknown[8] = 6;
  unknown[28] = 0x99; unknown[29] = 0x32;      // major 2, minor 0x99 — no documented offset
  const unknownInfo = pkliteInfo(unknown);
  // The minor byte is rendered as the decimal number the version label uses (`0x0c` → `1.12`),
  // so `0x99` reads as `2.153` — a label, not a claim about a real PKLITE release.
  assert.equal(unknownInfo.version, '2.153');
  assert.equal(unknownInfo.pklite, false);
  assert.match(unknownInfo.why, /no code-image offset is documented/);
});

test('the file names itself: PKLITE 1.12, extra and large, stream at 752', { skip }, () => {
  const info = pkliteInfo(readAcd());
  assert.equal(info.pklite, true, info.why);
  assert.equal(info.version, '1.12');
  assert.equal(info.major, 1);
  assert.equal(info.minor, 12);
  assert.equal(info.extra, true, 'the "extra" flag is bit 0x10 of byte 29');
  assert.equal(info.large, true, 'the codebook flag is bit 0x20 of byte 29');
  assert.equal(info.imageStart, 96, 'e_cparhdr 6 → the load image starts at 96');
  assert.equal(info.codeImageOffset, 656, 'the format table\'s 656 bytes for version pair 310c');
  assert.equal(info.streamOffset, 752);
  assert.match(info.copyright, /^PKLITE Copr\. 1990-91 PKWARE Inc\. All Rights Reserved/);
  assert.equal(info.copyrightAt, 83, 'the string is NUL-terminated at 83');
  assert.equal(info.notEnoughMemory, true, 'the decompressor\'s own message is in the stub');
});

test('the decode lands where a DOS load image has to land', { skip }, () => {
  const acd = readAcd();
  const unpacked = unpackPklite(acd);
  const { image, footer } = unpacked;
  assert.equal(image.length, 305520, 'the measured code-image size');
  assert.equal(image.length % 16, 0, 'an image is whole paragraphs, so a one-bit desync shows here');
  assert.equal(footer.ss * 16 + footer.sp, image.length,
    'the footer\'s stack must end exactly at the end of the image — the strongest single check '
    + 'of the whole chain (stream offset → decode → stop position)');
  assert.deepEqual({ cs: footer.cs, ip: footer.ip }, { cs: 0, ip: 0 },
    'the entry is the image\'s own first byte, which is why the image opens with the program\'s prologue');
  assert.deepEqual([...image.slice(0, 6)], [0xba, 0xa0, 0x3b, 0xb4, 0x30, 0xcd],
    'mov dx,3BA0h / mov ah,30h / int 21h — the DOS version call every DOS program opens with');
  assert.equal(unpacked.info.extra, true);
  assert.deepEqual(unpacked.warnings, []);
});

test('the relocation table parses after it, and lands on the file\'s own trailer', { skip }, () => {
  const acd = readAcd();
  const unpacked = unpackPklite(acd);
  assert.equal(unpacked.relocations.length, 4044);
  // The extra-compression form normalises every segment to a multiple of 0x0fff, so the segments
  // in the list are exactly that ladder — a property the file's own bytes demonstrate.
  const segments = new Set(unpacked.relocations.map((r) => r.segment));
  for (const s of segments) assert.equal(s % 0x0fff, 0, `${s} is not a multiple of 0x0fff`);
  assert.deepEqual(unpacked.relocations.at(-1), { segment: 16380, offset: 29780 });
  assert.equal(acd.length - unpacked.relocationEnd, 8, 'eight footer bytes, then the end of the file');
  assert.equal(unpacked.footer.extraBytes, 0);
});

test('the image is this game: Arena\'s own words are in it', { skip }, () => {
  const { image } = unpackPklite(readAcd());
  for (const text of ['Tamriel', 'Imperial Province', 'Khajiit', 'Nord', 'Redguard', 'to select your class?', 'wild.mif']) {
    assert.ok(findAscii(image, text) >= 0, `${text} should be in the code image`);
  }
  // The wilderness thresholds are numbers rather than a string, and the module reports them as a
  // count: they must be *present*, and a reading that drifts to another build would zero them.
  for (const word of [0x6666, 0x4000, 0x2666, 0x1999]) {
    assert.ok(findWords(image, [word]).length > 0, `0x${word.toString(16)} should appear in the image`);
  }
});
