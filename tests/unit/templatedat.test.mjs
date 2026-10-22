// THE TEMPLATE.DAT READER — `arena/templateDat.js` against the install's own text file.
//
// The file is Arena's game text (the main quest's narration among it). These pins read the real
// bytes: the entry counts come from the file, the opening speech's first words are the file's
// own, and the death cinematics (`1402`, `1403`) are present, so the reader is proven on the
// keys the story depends on.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { parseTemplateDat, templateEntries, templateStrings } from '../../src/arena/templateDat.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const FILE = path.join(ARENA, 'TEMPLATE.DAT');
const bytes = fs.existsSync(FILE) ? new Uint8Array(fs.readFileSync(FILE)) : null;

test('the install\'s TEMPLATE.DAT parses into its keyed entries', { skip: !bytes && 'no TEMPLATE.DAT in this install' }, () => {
  const entries = parseTemplateDat(bytes);
  assert.equal(entries.length, 809, 'every key line in the file is an entry');
  assert.equal(new Set(entries.map((e) => e.key)).size, 611, 'distinct keys');
  for (const e of entries) {
    assert.ok(Number.isInteger(e.key) && e.key >= 0 && e.key <= 9999, 'a four-digit key');
    assert.ok(!/[\r\n]/.test(e.value), 'values have their line breaks folded to spaces');
    assert.ok(!/ {2,}/.test(e.value), 'runs of spaces are collapsed');
  }
});

test('the opening speech (key 1400) is the file\'s own text, and its strings split at &', { skip: !bytes && 'no TEMPLATE.DAT' }, () => {
  const entries = parseTemplateDat(bytes);
  const [opening] = templateEntries(entries, 1400);
  assert.ok(opening, 'key 1400 exists');
  assert.ok(opening.value.startsWith('Do not fear for it is I, Ria Silmane.'), 'the speech opens with the file\'s own first line');
  assert.ok(opening.value.endsWith('my last and best hope...&'), 'and ends at its ampersand');
  assert.deepEqual(templateStrings(opening.value).length, 1, 'one string, the trailing & adds none');
});

test('the death cinematics (1402, 1403) are keyed in the file, one entry each', { skip: !bytes && 'no TEMPLATE.DAT' }, () => {
  const entries = parseTemplateDat(bytes);
  assert.equal(templateEntries(entries, 1402).length, 1);
  assert.equal(templateEntries(entries, 1403).length, 1);
});

test('a letter splits a key, and the letter filter answers only its own variant', { skip: !bytes && 'no TEMPLATE.DAT' }, () => {
  const entries = parseTemplateDat(bytes);
  const lettered = entries.find((e) => e.letter !== null);
  assert.ok(lettered, 'the file has at least one lettered key');
  assert.equal(templateEntries(entries, lettered.key, lettered.letter).every((e) => e.letter === lettered.letter), true);
  assert.equal(templateEntries(entries, lettered.key, '!').length, 0, 'an unknown letter matches nothing');
});

test('templateStrings splits on & and drops empty pieces', () => {
  assert.deepEqual(templateStrings('one & two &  & three&'), ['one', 'two', 'three']);
  assert.deepEqual(templateStrings(''), []);
});
