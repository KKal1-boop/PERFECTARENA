// THE STORY'S BEAT WIRING — what the quest plays, and when.
//
// `game/storyBeats.js` is pure wiring; the words and timing are the install's own
// (`game/storyScript.js`, `arena/storySpeech.js`). This holds the order still: the clue is a
// parchment, Ria's dreams belong to sleep and Tharn's vision to the next encounter, and the
// Jewel's cry is the one beat the pickup itself answers.
//
//   node --test tests/unit/storybeats.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { CUTSCENES, cutsceneByName } from '../../src/game/cutscene.js';
import { cutsceneSong } from '../../src/game/arenaMusic.js';
import {
  DREAM_MOVIE, ENDING_MOVIES, JEWEL_SCENE, JEWEL_SHIELD_SCENE, PALACE_MOVIE, PALACE_SCENE,
  STAFF_SCENES, THARN_MOVIE, storyMoviesFor, storyScenesFor,
} from '../../src/game/storyBeats.js';
import { JEWEL_CRY, PALACE_TAUNT, storyMovie, storySpeaker } from '../../src/game/storyScript.js';

test('the escape is travel, not a scene: the dream comes with sleep', () => {
  assert.deepEqual(storyMoviesFor('escaped'), []);
  assert.deepEqual(storyScenesFor('escaped'), []);
});

test('a clue is the parchment itself; no movie stands in for it', () => {
  assert.deepEqual(storyMoviesFor('foundClue'), []);
});

test('a piece plays nothing at the chest — Ria waits for sleep, Tharn for the next encounter', () => {
  for (const pieces of [1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.deepEqual(storyMoviesFor('foundPiece', { pieces }), [], `piece ${pieces}`);
  }
});

test('the Jewel’s cry is the one immediate scene, in Tharn’s own movie', () => {
  const scenes = storyScenesFor('jewelOfFire');
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0].textKey, JEWEL_CRY);
  assert.equal(scenes[0].movie, THARN_MOVIE);
  assert.deepEqual(storyMoviesFor('jewelOfFire'), ['JAGAR.FLC']);
});

test('the palace gate is Tharn’s 1447, not the Emperor’s movie', () => {
  assert.equal(PALACE_SCENE.textKey, PALACE_TAUNT);
  assert.equal(PALACE_MOVIE, THARN_MOVIE);
  assert.equal(PALACE_MOVIE, 'JAGAR.FLC');
});

test('the speakers are Arena’s two dream faces: Ria’s vision, Tharn’s jagar', () => {
  assert.equal(DREAM_MOVIE, 'VISION.FLC');
  assert.equal(THARN_MOVIE, 'JAGAR.FLC');
  assert.equal(storyMovie(1500), 'VISION.FLC');
  assert.equal(storyMovie(1294), 'VISION.FLC');
  assert.equal(storyMovie(1392), 'JAGAR.FLC');
  assert.equal(storyMovie(1447), 'JAGAR.FLC');
  assert.equal(storyMovie(1404), 'JAGAR.FLC');
  assert.equal(storySpeaker(1500), 'Ria Silmane');
  assert.equal(storySpeaker(1392), 'Jagar Tharn');
  assert.equal(storySpeaker(1447), 'Jagar Tharn');
});

test('the ending keeps Arena\'s whole chain in order', () => {
  // Tharn's fall (the CD's `NUJAGDTH.FLC`, or the original `JAGARDTH.FLC`), the Emperor
  // restored (`NUKING.FLC`, or its `KING.FLC` stand-in), then the closing diptych and the
  // corridor: five films, the order the install's own `END01`/`END02` art expects.
  assert.deepEqual([...ENDING_MOVIES], [
    'NUJAGDTH.FLC', 'NUKING.FLC', 'END01.FLC', 'END02.FLC', 'AFLC2.FLC',
  ]);
});

test('the Staff\'s assembly is the forge and the vision in the sky', () => {
  assert.deepEqual(STAFF_SCENES.map((s) => s.movie), ['STAFF.FLC', 'CHAOSVSN.FLC']);
  assert.deepEqual(storyMoviesFor('staffAssembled'), ['STAFF.FLC', 'CHAOSVSN.FLC']);
  assert.deepEqual(storyScenesFor('staffAssembled').map((s) => s.textKey), [null, null]);
});

test('the Jewel at the palace altar is the shield movie, and it is not a line of speech', () => {
  assert.equal(JEWEL_SHIELD_SCENE.movie, 'JAGRSHLD.FLC');
  assert.equal(JEWEL_SHIELD_SCENE.textKey, null);
  assert.deepEqual(storyMoviesFor('jewelShield'), ['JAGRSHLD.FLC']);
});

test('an event with no scene says so rather than inventing one', () => {
  for (const event of ['enter', 'mithrilKey', 'won', 'escaped', '', null]) {
    assert.deepEqual(storyScenesFor(event), [], String(event));
  }
});

test('every movie wired is one the catalogue knows, and every one has a cue', () => {
  const wired = [
    ...ENDING_MOVIES, PALACE_MOVIE, DREAM_MOVIE, THARN_MOVIE, JEWEL_SHIELD_SCENE.movie,
    ...STAFF_SCENES.map((s) => s.movie),
    ...storyMoviesFor('jewelOfFire'), ...storyMoviesFor('palaceGate'),
  ];
  for (const file of wired) {
    assert.ok(cutsceneByName(file), `${file} is in the catalogue`);
    assert.ok(CUTSCENES.some((c) => c.file === file), `${file} is an install movie`);
    assert.match(cutsceneSong(file) ?? '', /^[A-Z0-9_]{1,8}\.(?:XMI|XFM)$/, `${file} has a music cue`);
  }
});

test('the Jewel scene is the cry, not a morph or a shield', () => {
  assert.equal(JEWEL_SCENE.textKey, JEWEL_CRY);
  assert.equal(JEWEL_SCENE.movie, 'JAGAR.FLC');
});
