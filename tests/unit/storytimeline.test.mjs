// THE REFERENCE TIMELINE OF THE MAIN STORY (`src/game/storyTimeline.js`).
//
// The chapter starts are the reference video's own. These checks hold what the timeline has to
// agree with: the chapters run in order, the eight piece chapters play the quest's own dungeons in
// the quest's own order, and each map chapter comes just before its piece.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STORY_CHAPTERS, TIMELINE_PIECE_DUNGEONS, STAFF_DUNGEON_ORDER, chapterAt, chapterLength,
} from '../../src/game/storyTimeline.js';

test('the chapters start in order, the intro at zero and the ending last', () => {
  assert.equal(STORY_CHAPTERS[0].start, 0);
  assert.equal(STORY_CHAPTERS[0].kind, 'intro');
  assert.equal(STORY_CHAPTERS[STORY_CHAPTERS.length - 1].kind, 'ending');
  for (let i = 1; i < STORY_CHAPTERS.length; i++) {
    assert.ok(STORY_CHAPTERS[i].start > STORY_CHAPTERS[i - 1].start, `${STORY_CHAPTERS[i].label} starts after ${STORY_CHAPTERS[i - 1].label}`);
  }
});

test('the intro is four minutes and twenty-eight seconds, as the reference video shows', () => {
  assert.equal(chapterLength(0), 268);
  assert.equal(chapterAt(267).kind, 'intro');
  assert.equal(chapterAt(268).label, 'Staff Piece 1A');
});

test('the eight piece chapters play the quest’s dungeons in the quest’s order', () => {
  assert.deepEqual([...TIMELINE_PIECE_DUNGEONS], [...STAFF_DUNGEON_ORDER]);
  assert.equal(TIMELINE_PIECE_DUNGEONS.length, 8);
});

test('each map chapter comes just before the piece chapter it leads to', () => {
  const pairs = [];
  for (let i = 0; i < STORY_CHAPTERS.length; i++) {
    if (STORY_CHAPTERS[i].kind !== 'clue') continue;
    const piece = STORY_CHAPTERS[i + 1];
    assert.equal(piece?.kind, 'piece', `${STORY_CHAPTERS[i].label} is followed by a piece chapter`);
    pairs.push([STORY_CHAPTERS[i].dungeon, piece.dungeon]);
  }
  assert.equal(pairs.length, 8, 'eight map chapters, one for each piece');
  assert.deepEqual(pairs.map(([, piece]) => piece), [...STAFF_DUNGEON_ORDER]);
});

test('the finale and the ending come last, and the finale is the palace', () => {
  const finale = STORY_CHAPTERS.find((c) => c.kind === 'finale');
  assert.equal(finale.dungeon, 'The Imperial Palace');
  assert.equal(finale.start, 2742);
  assert.equal(STORY_CHAPTERS.at(-1).start, 3021);
  assert.equal(chapterLength(STORY_CHAPTERS.length - 1), null, 'the ending has no measured length');
});
