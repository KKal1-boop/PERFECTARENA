// NAMES — the corpus read from the sibling install's own `NAMEGEN.DAT`.
//
// Arena's `NAMES.DAT` is `EMPTY`-padded (S30). The sibling Daggerfall install carries
// the real generator, and this test proves the parser against **UESP's decoded XML**
// (`Daggerfall:XML:Namegen dat xml`): every bank's set sizes, and *samples at pinned
// indices* reproduce the XML's own sample names exactly — the parse is measured, not
// guessed. It also pins the stride law the parser is built on (cumulative count × 10
// from slot 528 lands on every bank boundary; the Noble bank closes the file).

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { NAMEGEN_BANKS, parseNamegen, personName } from '../../src/game/names.js';

const DF = 'C:/arenaproject/daggerfall/arena2/DF/DAGGER/ARENA2';
const buf = (() => {
  try {
    return fs.readFileSync(`${DF}/NAMEGEN.DAT`);
  } catch (err) {
    return null;
  }
})();

test('the corpus is present in the sibling install and parses to all 56 sets', () => {
  assert.ok(buf, 'the sibling Daggerfall install must be reachable for this test');
  const parsed = parseNamegen(buf);
  assert.ok(parsed, 'the file\u2019s own anchors (Breton\u2019s Theod, Noble\u2019s Lord) hold');
  const total = Object.values(parsed.banks).reduce((n, sets) => n + sets.reduce((m, set) => m + set.length, 0), 0);
  // 156 slots of sets = the strides of all 56 declared sets... exact per-bank count:
  // breton 13×6 + redguard 51+5+26+22+15 + nord 13+13+13+7 + darkElf 12×6 + highElf 70
  // + woodElf 69 + khajiit 91 + imperial 78 + goth 66 + mansion 48 + noble 48 = 785.
  assert.equal(total, 785, `every set slot of the corpus, not ${total}`);
  assert.equal(parsed.total, buf.length, 'the stride walk ends exactly at the file\u2019s own end');
});

test('pinned indices reproduce UESP\u2019s own sample names, bank by bank', () => {
  const { banks } = parseNamegen(buf);
  const joint = (bank, picks, ...indices) => indices.map((i, k) => banks[bank][i][picks[k]]).join('');
  // Breton male first, Theodistyr: Theod + istyr (set1 [12], per the walk's own slots).
  assert.equal(joint('breton', [0, 12], 0, 1), 'Theodistyr');
  // Breton surname, Hawkford: Hawk + ford (set5 [12]).
  assert.equal(joint('breton', [0, 12], 4, 5), 'Hawkford');
  // Redguard male single, Bathan: B + a + th + an.
  assert.equal(joint('redguard', [0, 0, 0, 0], 0, 1, 2, 3), 'Bathan');
  // Nord female first: Hell + e at the slots' own head (set3 [0]).
  assert.equal(joint('nord', [0, 0], 2, 3), 'Helle');
  // Imperial male, Tibacles: Tib + acles (set1 [12]).
  assert.equal(joint('imperial', [0, 12], 0, 1), 'Tibacles');
  // Khajiit male single, Mojnoud: Moj + noud (set1 [13]).
  assert.equal(joint('khajiit', [0, 13], 0, 1), 'Mojnoud');
  // Dark Elf male, Shurik: Shur + ik (set1 [0]).
  assert.equal(joint('darkElf', [0, 0], 0, 1), 'Shurik');
  // High Elf male, Solilas: Soli + las (set1 [11]).
  assert.equal(joint('highElf', [0, 11], 0, 1), 'Solilas');
  // Wood Elf female, Mingina: Min + gina (set3 [0]).
  assert.equal(joint('woodElf', [0, 0], 2, 3), 'Mingina');
  // Noble single name, Nebuchivarezzar: the binary's own order is roots+mids+suffixes
  // (the title set rides last in the file's tail bytes): Nebuch + iv + ezzar.
  const noble = joint('noble', [4, 7, 4], 0, 1, 2);
  assert.equal(noble, 'Nebuchivezzar', `Nebuch + iv + ezzar (\u201c${noble}\u201d)`);
  // The Noble titles *close* the file, bank-last in the binary's own order:
  assert.deepEqual(banks.noble[3], ['Lord', 'Count', 'Baron', 'Viscount', 'Marquis', 'Duke']);
});

test('the bank table is the file\u2019s own order and carries the stride law', () => {
  let off = 528;
  for (const bank of NAMEGEN_BANKS) {
    off += bank.counts.reduce((a, b) => a + b, 0) * 10;
  }
  assert.equal(off, buf.length, 'cumulative count×10 ends at the file end \u2014 the stride law');
});

test('personName composes race names by the generator\u2019s own rules', () => {
  const { banks } = parseNamegen(buf);
  const rng = { next: () => 0 }; // the first entry of every set — a deterministic reader
  assert.equal(personName({ banks, rng }, 'breton'), 'Theodore Hawkwing', 'breton: first + surname');
  assert.equal(personName({ banks, rng }, 'nord'), 'Erik Hawkwing', 'nord: first + Breton\u2019s surname');
  assert.equal(personName({ banks, rng }, 'redguard'), 'Bathan', 'redguard: one four-part name');
  assert.equal(personName({ banks, rng }, 'khajiit'), 'Mojtaba', 'khajiit: one two-part name');
  assert.equal(personName({ banks, rng }, 'imperial', true), 'Tabia Caesar', 'imperial female: 2+3 first, then the 4+5 surname');
  assert.ok(personName({ banks, rng }, 'noble', false, true).startsWith('Lord '),
    'nobles carry the file’s last-held title set');
  // The same rng gives the same name — a person keeps their name across visits.
  assert.equal(personName({ banks, rng }, 'breton'), personName({ banks, rng }, 'breton'));
  // No corpus = no name, and the game runs.
  assert.equal(personName({ banks: null, rng }, 'breton'), null);
});

test('a foreign file does not parse as the corpus', () => {
  const junk = new Uint8Array(3000).fill(0x41);
  assert.equal(parseNamegen(junk), null, 'the anchors refuse anything but the corpus');
});

test("the corpus's own monster banks compose one long name, and a mansion woman's rides one more", () => {
  const { banks } = parseNamegen(buf);
  const word = (bank, ...entries) => entries.map(([set, index]) => banks[bank][set][index]).join('');
  assert.equal(word('goth', [0, 0], [1, 0], [2, 0]), 'Grolantor');
  // The XML's own male sample carries the middle fragment ebr at set1 [7]: Dem + ebr + orgon.
  assert.equal(word('mansion', [0, 0], [1, 7], [2, 0]), 'Demebrorgon');
  const rng = { next: () => 0 };
  assert.equal(personName({ banks, rng }, 'goth'), 'Grolantor', 'goth: three parts at their heads');
  assert.equal(personName({ banks, rng }, 'mansion', true), 'Demogorgona', 'mansion female: 0+1+2+3 (one part more than the male\u2019s three)');
});
