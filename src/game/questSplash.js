// THE MAIN-QUEST DUNGEON SPLASH — Arena's own arrival page for the eight Staff dungeons.
//
// OpenTESArena's `MainQuestSplashUiState` is the original's screen this module reads: when a
// player fast-travels to a Staff dungeon the game puts up the province's splash picture and the
// dungeon's own paragraph from `DUNGEON.TXT` — “You stand before the dragon gate of Fang Lair,
// humbled before its majesty…” — before the level. The port had the paragraph nowhere: it
// loaded the level and printed a generic arrival line.
//
// The picture is the install's own hand-drawn map of the province (`HAMERFEL.IMG`,
// `HIGHROCK.IMG`, …), which is the nearest game-owned 320×200 plate to the original's province
// splash and is already read by the world map. The words are `DUNGEON.TXT`'s. Nothing is
// invented: a stage whose dungeon has no entry, or a page that is not that dungeon, answers
// null and the ordinary arrival line stands.

import { dungeonTxtFor, normaliseDungeonName } from '../arena/dungeonTxt.js';
import { PROVINCE_MAPS } from './mapScreen.js';

/**
 * The splash a page owes, or null.
 *
 * The stage decides **which** dungeon the quest is currently sending the player to: the clue
 * dungeon until its map is in hand, then the piece's own dungeon. A page only owes the splash
 * when it is standing in exactly that place — being in Fang Lair with the quest pointing at
 * the Crystal Tower is not the moment.
 *
 * @param {object} opts
 * @param {object|null} opts.stage the chain's current stage
 * @param {{mapKnown?: boolean}} [opts.quest]
 * @param {{title: string, description: string}[]} opts.entries `parseDungeonTxt`'s records
 * @param {string|null} opts.placeName the level's own name, as the scene knows it
 * @returns {{title: string, text: string, provinceID: number, artRecord: string, atClue: boolean}|null}
 */
export function questSplashFor({ stage, quest = {}, entries = [], placeName = null } = {}) {
  if (!stage || !placeName) return null;
  if (stage.kind === 'escape') return null;
  if (stage.kind === 'finale') return null;
  const atClue = !quest.mapKnown && Boolean(stage.clue?.title);
  const wanted = atClue ? stage.clue.title : stage.title;
  if (!wanted || normaliseDungeonName(wanted) !== normaliseDungeonName(placeName)) return null;
  const entry = dungeonTxtFor(entries, wanted);
  if (!entry) return null;
  const provinceID = Number.isInteger(stage.provinceID) ? stage.provinceID : 8;
  return {
    title: entry.title,
    text: entry.description,
    provinceID,
    artRecord: PROVINCE_MAPS[provinceID] ?? 'IMPERIAL.IMG',
    atClue,
  };
}

/**
 * Wrap a splash paragraph at a column, preserving the file's own paragraph breaks.
 *
 * The original's screen is a fixed 320×200 page; this project's panel is wider, so the wrap
 * is a page rule (58 columns) rather than a reading of the font, and is named as one.
 *
 * @param {string} text
 * @param {number} [columns]
 * @returns {string[]}
 */
export function wrapSplashText(text, columns = 58) {
  const out = [];
  for (const paragraph of String(text ?? '').split(/\n{2,}/)) {
    const flat = paragraph.replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    let line = '';
    for (const word of flat.split(' ')) {
      if (line && `${line} ${word}`.length > columns) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
