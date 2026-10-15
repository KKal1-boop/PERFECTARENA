// THE LEVEL'S OWN TRIGGERS — `*TRIG` pinned against the install's own bytes.
//
// The law was measured, twice and against the archive, before a line was written
// (see `tools/` history and docs/ROADMAP.md §5): a `TRIG` cell's four bytes are
// `x, y`, then two **signed** bytes — text and sound. `255` reads `-1` (no text,
// no sound), the sound byte names a `@SOUND` **slot** (the number on the line
// itself, `"SPLASH.VOC 23"`), and the text byte names a `*TEXT` id in the shared
// id space of lore, keys and riddles. `halls1.inf`–`halls3.inf`, `39300577.MIF`
// (the loremaster's halls, its `INFO` chunk naming the `.INF`s) are the witnesses:
// lore ids `{0, 1, 8}` and keys `{2..7}` on the first level show the shared space,
// the trigger sound range `17..30` lands in its `@SOUND` slots 17–30, and the
// cell `<x=4, y=69>` names sound 23 with no text — `SPLASH.VOC`.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { parseMif } from '../../src/arena/mifFile.js';
import { parseInf } from '../../src/arena/infFile.js';
import { parseBsa } from '../../src/arena/bsaArchive.js';
import { signedByte, triggerTable, triggerText, triggerSound, triggerEvent } from '../../src/game/levelTriggers.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

/** Loose file or archive member, by name. */
function read(name) {
  try { return new Uint8Array(fs.readFileSync(path.join(ARENA, name))); } catch { /* loose miss */ }
  const bsaPath = path.join(ARENA, 'GLOBAL.BSA');
  try {
    const bsa = parseBsa(new Uint8Array(fs.readFileSync(bsaPath)), 'GLOBAL.BSA');
    return bsa.get(name);
  } catch {
    return null;
  }
}

const haveData = Boolean(read('39300577.MIF') && read('halls1.inf'));

test('a trig byte is signed: 255 is -1, and small ids pass through', () => {
  assert.equal(signedByte(255), -1);
  assert.equal(signedByte(0), 0);
  assert.equal(signedByte(24), 24);
  assert.equal(signedByte(128), -128);
});

test('the loremaster halls carry triggers that resolve against their own .INF', () => {
  if (!haveData) return;   // no install beside this checkout, no pins
  const mif = parseMif(read('39300577.MIF'), '39300577.MIF');
  const level1 = mif.levels[0];
  assert.ok(level1.trig.length >= 40, `the first hall has its own triggers (${level1.trig.length})`);
  const inf = parseInf(read(level1.info.toUpperCase()), level1.info);
  assert.ok(inf.sounds.length >= 25, `the hall's own @SOUND list (${inf.sounds.length} sounds)`);

  // The measured table key: the trigger at `x=4, y=69` names sound slot 23, no text —
  // `SPLASH.VOC 23` in `halls1.inf`'s own @SOUND section.
  const table = triggerTable(level1);
  const splash = table.get('69,4');
  assert.ok(splash, 'the measured splash trigger is in the table, keyed row,col');
  assert.equal(splushCheck(splash, inf), 'SPLASH.VOC');
  assert.equal(triggerText(inf, splash), null, '-1 is no prose');

  // The shared text id space: level 1's lore ids are {0, 1, 8} and keys {2..7}, so a
  // trigger naming 8 has lore prose and one naming 3 has a key ward — the trigger at
  // `x=3, y=48` names text 1, lore.
  const lore = table.get('48,3');
  assert.ok(lore, 'the measured lore trigger is in the table');
  const prose = triggerText(inf, lore);
  assert.equal(prose.kind, 'lore');
  assert.ok(prose.text.length > 40, `real prose from the level's own record (${prose.text.length} chars)`);

  // The whole table is only cells that mean something.
  for (const t of table.values()) {
    assert.ok(t.textIndex >= 0 || t.soundIndex >= 0, 'a silent, textless cell is not in the table');
  }
  assert.ok(table.size <= level1.trig.length);
});

function splushCheck(trigger, inf) {
  return triggerSound(inf, trigger);
}

test('the INF parser keeps the slot number the @SOUND line itself carries', () => {
  assert.deepEqual(parseInf('@SOUND\nSPLASH.VOC 23\nSPLAY.VOC\n', 'probe.inf').sounds[0], { file: 'SPLASH.VOC', index: 23 });
  assert.deepEqual(parseInf('@SOUND\nLOOSE.VOC\n', 'probe.inf').sounds[0], { file: 'LOOSE.VOC', index: -1 });
});

test('triggerEvent and the slot lookup answer nulls, never throw, outside the level\'s records', () => {
  const inf = parseInf('@SOUND\nCLANK.VOC 4\n@TEXT\n*TEXT 0\n~A line.\n', 'probe.inf');
  assert.equal(triggerSound(inf, { soundIndex: 23 }), null, 'an unknown slot is not a file');
  assert.equal(triggerSound(inf, { soundIndex: 4 }), 'CLANK.VOC');
  assert.equal(triggerText(inf, { textIndex: 9 }), null);
  assert.equal(triggerText(inf, { textIndex: 0 }).text, 'A line.');
  assert.equal(triggerEvent(inf, { textIndex: 0, soundIndex: 4 }).sound, 'CLANK.VOC');
});
