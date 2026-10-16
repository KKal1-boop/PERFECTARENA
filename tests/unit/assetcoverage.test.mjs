// THE CENSUS TOOL'S OWN RULES — pinned without an install.
//
// `tools/assetcoverage.mjs` is the only place in this project that answers "the install ships
// this; does the port read it?", and its answer is quoted by `docs/DEFECTS.md` (D-03, D-24),
// `docs/ROADMAP.md` §1 and `docs/ASSETS.md`. The number it prints ("1 691 records are named by
// nothing") is only useful once it is **grouped by what would read the record**, and a group is
// a rule — so the rules are here, where they can be checked, rather than in a script nobody runs
// twice.
//
// **No test in this file touches the filesystem.** The tool's classifiers, its argument parser
// and its grouping maths are pure and exported for exactly this; `main()` — the only function
// that opens `GLOBAL.BSA` — is not called here at all. A machine with its install elsewhere can
// still run `npm test`, and a rule that drifts fails here instead of quietly changing a table in
// a document.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TOP, GROUP_MODULES, KIND_OF_EXT, SCREEN_PREFIXES,
  consumerGroupOf, extensionOf, groupRecords, kindOf, parseArgs, sortBySize, summarise, topBySize,
} from '../../tools/assetcoverage.mjs';

// ── the extension and the kind ────────────────────────────────────────────────

test('a record is classified by its extension, and a bare name is `(none)`', () => {
  assert.equal(extensionOf('EQUIPMEN.IMG'), 'img');
  assert.equal(extensionOf('GLOBAL.BSA'), 'bsa');
  assert.equal(extensionOf('WILD001.RMD'), 'rmd');
  assert.equal(extensionOf('ARENA'), '(none)', 'a loose file with no dot has no extension to read');
  assert.equal(extensionOf('A.B.C'), 'c', 'the LAST dot is the extension, as 8.3 names require');
  assert.equal(extensionOf(''), '(none)');
  assert.equal(extensionOf(null), '(none)');
  // Every family `docs/FORMATS.md` §2 counts has a kind, and the counts there are the census.
  const families = { img: 'image', cif: 'image', mif: 'map', inf: 'map-definition', rmd: 'wilderness-block', cfa: 'creature-set', dfa: 'fixture', set: 'tileset', voc: 'sound', flc: 'movie', xfm: 'music', xmi: 'music', col: 'palette', dat: 'table' };
  for (const [ext, kind] of Object.entries(families)) {
    assert.equal(KIND_OF_EXT[ext], kind, `.${ext} is ${kind}`);
    assert.equal(kindOf(`SOMETHING.${ext.toUpperCase()}`), kind);
  }
  assert.equal(kindOf('NOBODY.XYZ'), 'other', 'an unknown family is not guessed at');
});

// ── the group: what would read it ─────────────────────────────────────────────

test('the seven families the work list is made of land in their own groups', () => {
  // The screens are the only family that needs a name rule: `.IMG` carries both full-screen art
  // and scenery, so the prefix list decides (`SCREEN_PREFIXES`).
  assert.equal(consumerGroupOf('TITLE.IMG'), 'screen');
  assert.equal(consumerGroupOf('SCROLL03.IMG'), 'screen');
  assert.equal(consumerGroupOf('SPELLMKR.IMG'), 'screen');
  assert.equal(consumerGroupOf('MAGE.CEL'), 'class-art', 'the class art is loose art, not a panel');
  assert.equal(consumerGroupOf('CASA.IMG'), 'image-art', 'a wall/floor tile is not a screen');
  assert.equal(consumerGroupOf('EQUIPMEN.IMG'), 'image-art');
  assert.equal(consumerGroupOf('FLCAST_A.IMG'), 'image-art');
  assert.equal(consumerGroupOf('CASA.SET'), 'tileset');
  assert.equal(consumerGroupOf('01CHNWLK.CFA'), 'creature-set');
  assert.equal(consumerGroupOf('ZOMBIE6.CFA'), 'creature-set');
  assert.equal(consumerGroupOf('BRAZIER.DFA'), 'fixture');
  assert.equal(consumerGroupOf('WILD001.RMD'), 'wilderness-block');
  assert.equal(consumerGroupOf('39300577.MIF'), 'level-map');
  assert.equal(consumerGroupOf('START.INF'), 'level-map');
  assert.equal(consumerGroupOf('BASH.VOC'), 'sound');
  assert.equal(consumerGroupOf('INTRO.FLC'), 'movie');
  assert.equal(consumerGroupOf('ARENA.XFM'), 'music');
  assert.equal(consumerGroupOf('PAL.COL'), 'palette');
  assert.equal(consumerGroupOf('CLASSES.DAT'), 'table');
  assert.equal(consumerGroupOf('GLOBAL.BSA'), 'other', 'the archive itself belongs to no consumer');
  assert.equal(consumerGroupOf('ACD.EXE'), 'tooling');
  assert.equal(consumerGroupOf('NOBODY.XYZ'), 'other');
});

test('every group the classifier can answer names the module that would consume it', () => {
  // The point of the table in `docs/ASSETS.md`: a group with no home is a gap, not a sentence.
  const reachable = new Set(Object.keys(GROUP_MODULES));
  const produced = new Set(Object.values(KIND_OF_EXT).map((kind) => GROUP_MODULES_OF(kind)));
  for (const name of ['TITLE.IMG', 'CASA.SET', '01CHNWLK.CFA', 'BRAZIER.DFA', 'WILD001.RMD', 'START.MIF', 'START.INF', 'BASH.VOC', 'INTRO.FLC', 'ARENA.XFM', 'PAL.COL', 'CLASSES.DAT', 'GLOBAL.BSA', 'ACD.EXE', 'NOBODY.XYZ']) {
    const group = consumerGroupOf(name);
    assert.ok(reachable.has(group), `${name} → ${group} has a module`);
    assert.ok(String(GROUP_MODULES[group]).length > 0);
    produced.add(group);
  }
  // …and a group that would be *reachable* but that no name can produce is dead weight only if
  // it is not one of the two the name rule owns.
  assert.ok(produced.has('screen') && produced.has('image-art'));
  assert.ok(SCREEN_PREFIXES.every((p) => p === p.toUpperCase()), 'the prefix list is upper case');
});

/** The group a *kind* maps to, as the classifier itself would answer for that family. */
function GROUP_MODULES_OF(kind) {
  return { image: 'image-art', map: 'level-map', 'map-definition': 'level-map', 'wilderness-block': 'wilderness-block', 'creature-set': 'creature-set', fixture: 'fixture', tileset: 'tileset', sound: 'sound', movie: 'movie', music: 'music', palette: 'palette', table: 'table', text: 'text', archive: 'other', executable: 'tooling', script: 'tooling', config: 'config', driver: 'driver', other: 'other' }[kind];
}

// ── the arguments ─────────────────────────────────────────────────────────────

test('the flags are parsed as the command line spells them', () => {
  assert.deepEqual(parseArgs([]), { onlyExt: null, wantUsed: false, wantGroups: false, asJson: false, top: DEFAULT_TOP });
  assert.equal(parseArgs(['--unused', 'cfa']).onlyExt, 'cfa');
  assert.equal(parseArgs(['--unused', 'CFA']).onlyExt, 'cfa', 'an extension is case-insensitive');
  assert.equal(parseArgs(['--unused']).onlyExt, null, 'a flag with no value filters nothing');
  assert.equal(parseArgs(['--used']).wantUsed, true);
  assert.equal(parseArgs(['--groups']).wantGroups, true);
  assert.equal(parseArgs(['--json']).asJson, true);
  assert.equal(parseArgs(['--top', '40']).top, 40);
  assert.equal(parseArgs(['--unused', 'img', '--top', '12', '--groups']).top, 12);
  assert.equal(parseArgs(['--top']).top, DEFAULT_TOP, 'no number keeps the displayed default');
  assert.equal(parseArgs(['--top', 'nonsense']).top, DEFAULT_TOP);
  assert.equal(parseArgs(['--top', '0']).top, DEFAULT_TOP);
  assert.equal(parseArgs(['--top', '-3']).top, DEFAULT_TOP);
});

// ── the maths ─────────────────────────────────────────────────────────────────

const rows = [
  { name: 'EQUIPMEN.IMG', size: 6000 },
  { name: 'CASA.SET', size: 4000 },
  { name: '01CHNWLK.CFA', size: 3000 },
  { name: 'BASH.VOC', size: 2000 },
  { name: 'NOBODY.XYZ', size: 1000 },
];

test('grouping sums a group and orders the groups by bytes', () => {
  const groups = groupRecords(rows);
  const byName = Object.fromEntries(groups.map((g) => [g.group, g]));
  assert.equal(byName['image-art'].count, 1);
  assert.equal(byName['image-art'].bytes, 6000);
  assert.equal(byName.tileset.bytes, 4000);
  assert.equal(byName['creature-set'].names[0], '01CHNWLK.CFA');
  assert.equal(byName.other.names[0], 'NOBODY.XYZ', 'an unknown family is still reported');
  assert.deepEqual(groups.map((g) => g.group), ['image-art', 'tileset', 'creature-set', 'sound', 'other']);
  assert.equal(groups.reduce((n, g) => n + g.count, 0), rows.length, 'every row is in exactly one group');
  assert.equal(groups.reduce((n, g) => n + g.bytes, 0), 16000);
  for (const g of groups) assert.equal(typeof g.module, 'string');
  // …and two records of one group add up.
  const pair = groupRecords([{ name: 'A.IMG', size: 5 }, { name: 'B.IMG', size: 7 }]);
  assert.equal(pair.length, 1);
  assert.equal(pair[0].count, 2);
  assert.equal(pair[0].bytes, 12);
  assert.deepEqual(groupRecords([]), []);
  assert.deepEqual(groupRecords(undefined), []);
});

test('largest first, ties by name, and the input is never reordered', () => {
  const input = [{ name: 'B.IMG', size: 10 }, { name: 'A.IMG', size: 10 }, { name: 'C.IMG', size: 99 }];
  const ordered = sortBySize(input);
  assert.deepEqual(ordered.map((r) => r.name), ['C.IMG', 'A.IMG', 'B.IMG']);
  assert.deepEqual(input.map((r) => r.name), ['B.IMG', 'A.IMG', 'C.IMG'], 'the caller\'s array is untouched');
  assert.deepEqual(topBySize(input, 2).map((r) => r.name), ['C.IMG', 'A.IMG']);
  assert.equal(topBySize(input, 0).length, 0);
  assert.equal(topBySize(input).length, 3, 'no count is every row');
});

test('the summary counts what the run prints', () => {
  const s = summarise(rows);
  assert.equal(s.count, 5);
  assert.equal(s.bytes, 16000);
  assert.deepEqual(s.byExt, { img: 1, set: 1, cfa: 1, voc: 1, xyz: 1 });
  assert.equal(s.byGroup['image-art'], 1);
  assert.equal(Object.values(s.byGroup).reduce((a, b) => a + b, 0), 5);
  assert.equal(summarise([]).count, 0);
  assert.equal(summarise().bytes, 0);
  // A row whose extension was never filled in is classified from its own name.
  assert.equal(summarise([{ name: 'X.SET', size: 1 }]).byExt.set, 1);
});
