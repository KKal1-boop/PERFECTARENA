// THE MAIN STORY'S REFERENCE TIMELINE — the chapter starts of a full, commentary-free playthrough
// of Arena's cutscenes, dialogue and flavour text (the owner's reference video).
//
// This is **measurement data, not playback**: it records how long each beat of the story runs in
// the original, so a check can compare the port's own beats against it. Nothing in the game reads
// it to decide what plays. The video's narration and dialogue are not transcribed here, and the
// beat-to-clip mapping is not known from the install (see docs/FIDELITY-2026-10-20.md).
//
// Each entry starts at `start` seconds. `label` is the chapter's own title. The eight staff-piece
// chapters come in pairs: the **A** chapter finds the map that reveals a piece, the **B** chapter
// finds the piece in that dungeon. `dungeon` names the dungeon the chapter is set in, and it is
// checked against `game/questData.js`'s own order.

import { STAFF_DUNGEON_ORDER } from './questData.js';

/** @type {ReadonlyArray<{start: number, label: string, dungeon: string|null, kind: string}>} */
export const STORY_CHAPTERS = Object.freeze([
  { start: 0, label: 'Intro', dungeon: null, kind: 'intro' },
  { start: 268, label: 'Staff Piece 1A', dungeon: 'Stonekeep', kind: 'clue' },
  { start: 469, label: 'Staff Piece 1B', dungeon: 'Fang Lair', kind: 'piece' },
  { start: 561, label: 'Staff Piece 2A', dungeon: 'Fortress of Ice', kind: 'clue' },
  { start: 762, label: 'Staff Piece 2B', dungeon: 'Labyrinthian', kind: 'piece' },
  { start: 838, label: 'Staff Piece 3A', dungeon: "Selene's Web", kind: 'clue' },
  { start: 1064, label: 'Staff Piece 3B', dungeon: 'Elden Grove', kind: 'piece' },
  { start: 1138, label: 'Staff Piece 4A', dungeon: 'Temple of Agamanus', kind: 'clue' },
  { start: 1325, label: 'Staff Piece 4B', dungeon: 'Halls of Colossus', kind: 'piece' },
  { start: 1463, label: 'Staff Piece 5A', dungeon: 'Temple of Mad God', kind: 'clue' },
  { start: 1693, label: 'Staff Piece 5B', dungeon: 'Crystal Tower', kind: 'piece' },
  { start: 1789, label: 'Staff Piece 6A', dungeon: 'Mines of Khuras', kind: 'clue' },
  { start: 2049, label: 'Staff Piece 6B', dungeon: 'Crypt of Hearts', kind: 'piece' },
  { start: 2187, label: 'Staff Piece 7A', dungeon: 'Vaults of Gemin', kind: 'clue' },
  { start: 2357, label: 'Staff Piece 7B', dungeon: 'Murkwood', kind: 'piece' },
  { start: 2474, label: 'Staff Piece 8A', dungeon: 'Black Gate', kind: 'clue' },
  { start: 2645, label: 'Staff Piece 8B', dungeon: 'Dagoth-Ur', kind: 'piece' },
  { start: 2742, label: 'Final conflict', dungeon: 'The Imperial Palace', kind: 'finale' },
  { start: 3021, label: 'Ending', dungeon: null, kind: 'ending' },
]);

/**
 * The chapter a time (in seconds) falls in, or null before the first chapter.
 * @param {number} seconds
 * @returns {(typeof STORY_CHAPTERS)[number]|null}
 */
export function chapterAt(seconds) {
  let found = null;
  for (const chapter of STORY_CHAPTERS) {
    if (seconds >= chapter.start) found = chapter;
    else break;
  }
  return found;
}

/**
 * The reference length, in seconds, of one chapter: from its start to the next chapter's start.
 * The ending has no next chapter, so it has no measured length here (null).
 * @param {number} index
 * @returns {number|null}
 */
export function chapterLength(index) {
  const here = STORY_CHAPTERS[index];
  const next = STORY_CHAPTERS[index + 1];
  if (!here || !next) return null;
  return next.start - here.start;
}

/** The piece dungeons, in the order the timeline plays them (the `piece` chapters). */
export const TIMELINE_PIECE_DUNGEONS = Object.freeze(
  STORY_CHAPTERS.filter((c) => c.kind === 'piece').map((c) => c.dungeon),
);

export { STAFF_DUNGEON_ORDER };
