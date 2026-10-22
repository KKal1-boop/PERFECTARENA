// WHERE A GAME BEGINS — the law, without a renderer.
//
// The owner, playing this port beside the original (2026-10-16): *"in the real arena after
// character creation a cutscene missing in perfectarena you start in the imperial dungeon"*.
// Two separate laws are in that sentence, and both were wrong here in different ways:
//
//   * **the destination** — a new character was handed to the world map, which is the middle
//     of Arena's story; the quest's own first stage is the escape from the Imperial Dungeons
//     (`game/questData.js`, `game/questState.js`), so the character was starting a step ahead
//     of themselves;
//   * **the movie** — `INTRO.FLC` played, but its once-per-tab flag (`sessionStorage`) meant a
//     reload taken while creating a character suppressed it for the rest of the session, which
//     is exactly how a missing cutscene looks from the player's chair.
//
// These are the numbers the tests below hold to the sources rather than to a snapshot: the
// start file is the one `questData.js` names, and the URL keys are the ones `main.js`'s dev
// door honours.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCENE_KEYS, START_INTERIOR, asksForScene, destinationParams, isGameStart, resumeParams,
} from '../../src/game/startFlow.js';
import { START_DUNGEON } from '../../src/game/questData.js';

const params = (search = '') => new URLSearchParams(search);

// ── the start file ────────────────────────────────────────────────────────────

test('a new game begins in the dungeon the quest chain begins in', () => {
  // The two modules have to agree: this is the cell the player wakes in, and it is the file
  // the main quest's stage 0 is about. A copy of the name that drifted from `questData.js`
  // would put the player somewhere the quest does not know about.
  assert.equal(START_INTERIOR, START_DUNGEON.mif);
  assert.equal(START_INTERIOR, 'START.MIF');
});

// ── is this a game start, or a scene of its own? ──────────────────────────────

test('a deep link is taken at its word: every scene key is a request, not a new game', () => {
  for (const key of SCENE_KEYS) {
    const url = params(`${key}=${key === 'interior' ? START_INTERIOR : 'x'}`);
    assert.equal(asksForScene(url), true, `?${key}= is a scene`);
    assert.equal(isGameStart(url), false, `?${key}= is not a new game`);
  }
  // …and `?nointro` is the player's own way past the movie, on an otherwise ordinary boot.
  assert.equal(isGameStart(params('arena=C:/arena')), true);
  assert.equal(isGameStart(params('arena=C:/arena&nointro')), false);
});

// ── where creation hands the player on ────────────────────────────────────────

test('a character made just now wakes in the Imperial Dungeons', () => {
  const dest = destinationParams(params('arena=C:/arena'), { fresh: true });
  assert.equal(dest.get('interior'), START_INTERIOR);
  assert.equal(dest.has('map'), false, 'and not on the world map');
  // Creation is not a destination, so its own parameters are dropped on the way.
  assert.equal(dest.get('arena'), 'C:/arena', 'the dev door still travels with the player');
  const asked = destinationParams(params('chargen&nomake&seed=7&class=mage'), { fresh: true });
  for (const key of ['chargen', 'nomake', 'seed', 'class']) {
    assert.equal(asked.has(key), false, `${key} is creation's own parameter`);
  }
});

test('a character who already existed is not teleported into a story they were already in', () => {
  // A reload of a page that named nothing is not a new game: it lands on the world map, the
  // scene the port has always used as home.
  const dest = destinationParams(params('arena=C:/arena'), { fresh: false });
  assert.equal(dest.has('map'), true);
  assert.equal(dest.has('interior'), false);
  assert.equal(destinationParams(params('')).get('map'), '', 'and the flag is a bare marker');
  assert.equal(destinationParams(params(''), { fresh: true }).get('interior'), START_INTERIOR);
});

test('an asked-for scene survives creation untouched', () => {
  const city = destinationParams(params('city=town&level=2'), { fresh: true });
  assert.equal(city.get('city'), 'town');
  assert.equal(city.get('level'), '2');
  assert.equal(city.has('interior'), false, 'a scene of its own is not overridden by the start');
  const dungeon = destinationParams(params('dungeon=Fang%20Lair'), { fresh: false });
  assert.equal(dungeon.get('dungeon'), 'Fang Lair');
  assert.equal(dungeon.has('map'), false);
});

// ── when the opening movie is owed ────────────────────────────────────────────

// ── Continue, from the start menu ─────────────────────────────────────────────

test('Continue resumes the save\'s own last place, and drops the menu\'s own keys', () => {
  const source = params('arena=C:/arena&interior=START.MIF&level=2');
  const city = resumeParams(source, { name: 'Rihad', dungeon: false });
  assert.equal(city.get('location'), 'Rihad');
  assert.equal(city.get('interior'), null, 'a stale scene key cannot override the save');
  assert.equal(city.get('level'), null);
  assert.equal(city.get('arena'), 'C:/arena', 'the Arena folder travels with it');

  const dungeon = resumeParams(params('arena=C:/arena'), { name: 'Fang Lair', dungeon: true, seed: 419 });
  assert.equal(dungeon.get('dungeon'), 'Fang Lair');
  assert.equal(dungeon.get('dungeonSeed'), '419');
  assert.equal(dungeon.get('location'), null);

  // A named interior (the cell, the palace) is a file, not a map location.
  const cell = resumeParams(params(''), { name: 'START.MIF', dungeon: true });
  assert.equal(cell.get('interior'), 'START.MIF');
  assert.equal(cell.get('dungeon'), null);

  const nowhere = resumeParams(params(''), null);
  assert.equal(nowhere.get('map'), '', 'a character who has stood nowhere opens the map');
  assert.equal(nowhere.get('interior'), null);
});

// The opening is no longer gated per tab: every new game plays `INTRO.FLC`, and the cell
// always owes Ria's explanation (`unit/storyscript`), so a reload cannot swallow either.
