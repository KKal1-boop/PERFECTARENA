// THE STILL PEOPLE — the art the install ships for the NPCs that never walk, and the court.
//
// The owner, 2026-10-17: *"there are a lot of missing sprites for the game that most of the time
// were static npcs in the original game that were not ported to perfectarena like
// AR-sprite-GUARD1D.png AR-sprite-KING.png AR-sprite-MAN01.png … and you still also havent
// introduced the KING and QUEENS SPRITES to use in palaces"*. Two claims are pinned here:
//
//   * **the records exist**, and they are the install's own — every art name the table names is
//     read back out of `GLOBAL.BSA`, so a typo is a red test rather than a figure that silently
//     never appears;
//   * **the court is a law**: a city's palace holds a ruler, a consort and an heir; a town's
//     holds two; the words are the province's, and a province the table does not know keeps the
//     default rather than answering nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COURT_TITLES, DEFAULT_COURT, STATIC_FOLK, STATIC_FOLK_ART, courtOf, courtTitlesFor,
  isPalaceMap, rulerLabel,
} from '../../src/game/staticFolk.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';

test('the still people are the records the owner named, in three families', () => {
  assert.deepEqual(Object.keys(STATIC_FOLK).sort(), ['court', 'townsfolk', 'watch']);
  assert.deepEqual(STATIC_FOLK.court.map((f) => f.art).sort(),
    ['KING.IMG', 'PRINCE.IMG', 'PRINCESS.IMG', 'QUEEN.IMG']);
  // **The owner's own three examples**, each accounted for: the guard, the king, the man.
  assert.ok(STATIC_FOLK_ART.includes('GUARD1D.IMG'));
  assert.ok(STATIC_FOLK_ART.includes('KING.IMG'));
  assert.ok(STATIC_FOLK_ART.includes('MAN01.DFA') && STATIC_FOLK_ART.includes('MAN01.IMG'));
  // Every entry has a role and a label: a figure with no words is a figure nobody can talk about.
  for (const family of Object.values(STATIC_FOLK)) {
    assert.ok(family.length >= 2);
    for (const entry of family) {
      assert.ok(/^[A-Z0-9]+\.(IMG|DFA)$/.test(entry.art), entry.art);
      assert.ok(entry.label.length > 3, entry.art);
      assert.ok(entry.role.length > 2, entry.art);
    }
  }
  // The town's idlers prefer the animated original where the install ships it, and name the still
  // picture as the fallback — so a partial install still draws a person.
  assert.ok(STATIC_FOLK.townsfolk.every((f) => f.art.endsWith('.DFA') && f.fallback?.endsWith('.IMG')));
});

test('every art name the table claims is really in the install', { skip: !fs.existsSync(ARENA) }, async () => {
  const { ArenaData } = await import('../../src/arena/arenaData.js');
  const { nodeSource } = await import('../../tools/lib/nodeSource.mjs');
  const data = new ArenaData(nodeSource(ARENA), { onWarn: () => {} });
  const names = new Set((await data.bsa()).names().map((n) => n.toUpperCase()));
  const missing = STATIC_FOLK_ART.filter((name) => !names.has(name.toUpperCase()));
  assert.deepEqual(missing, [], 'a name this module promises is a record the install does not ship');
});

test('a city\'s court is three, a town\'s is two, and a village has no palace at all', () => {
  const city = courtOf({ province: 'High Rock', kind: 'city' });
  assert.equal(city.length, 3);
  assert.deepEqual(city.map((f) => f.art), ['KING.IMG', 'QUEEN.IMG', 'PRINCE.IMG']);
  assert.match(city[0].label, /count/i, 'High Rock\'s ruler is a count in this project\'s reading');
  const town = courtOf({ province: 'Skyrim', kind: 'town' });
  assert.equal(town.length, 2);
  assert.match(town[0].label, /jarl/i);
  // A place with no province, and no place at all, still answers a court rather than throwing.
  assert.deepEqual(courtOf(null).map((f) => f.art), ['KING.IMG', 'QUEEN.IMG']);
  assert.equal(courtTitlesFor({ province: 'Atlantis' }), DEFAULT_COURT);
  assert.equal(rulerLabel({ province: 'Morrowind' }), 'the duke');
  // Every province the table names has all three words, so no palace can print `undefined`.
  for (const [province, titles] of Object.entries(COURT_TITLES)) {
    assert.deepEqual(Object.keys(titles).sort(), ['consort', 'heir', 'ruler'], province);
    assert.ok(Object.values(titles).every((word) => typeof word === 'string' && word.length > 3), province);
  }
});

test('a palace is the map the install ships a throne in', () => {
  for (const name of ['PALACE1.MIF', 'PALACE5.MIF', 'PALACE.MIF', 'IMPPAL.MIF']) {
    assert.equal(isPalaceMap(name), true, name);
  }
  for (const name of ['TAVERN1.MIF', 'CITYW2.MIF', 'NOBLE3.MIF', 'PALACE1', '']) {
    assert.equal(isPalaceMap(name), false, name);
  }
});
