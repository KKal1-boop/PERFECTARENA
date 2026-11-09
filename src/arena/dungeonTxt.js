// DUNGEON.TXT — the words Arena puts on screen when the player stands before a
// main-quest dungeon.
//
// The install ships this as a loose text file, not in `GLOBAL.BSA`. Its shape is
// OpenTESArena's (`TextAssetLibrary.cpp`, `initDungeonTxt`): a dungeon's name on one
// line, its description on the lines after it, and a line holding only `#` between
// one dungeon and the next. The descriptions are exactly the italic paragraphs the
// walkthroughs quote — "You stand before the dragon gate of Fang Lair…" — and they
// are the original's own arrival splash for the eight Staff dungeons.
//
// The original shows the splash when the player reaches the dungeon, every time
// (UESP's *Imperial Palace* notes that returning to a main-quest dungeon still
// prints its piece-of-the-Staff text). This module is only the reading; the screen
// is `game/questSplash.js` and the scene is `scenes/interior.js`.

/** The loose file's name, as the install spells it. */
export const DUNGEON_TXT_RECORD = 'DUNGEON.TXT';

/**
 * Parse `DUNGEON.TXT` into one record per dungeon.
 *
 * The file is ASCII (the CD release's own text), so `latin1` is the honest decoder:
 * it cannot throw on a stray byte the way a strict UTF-8 decode can, and every
 * printable character in the file is ASCII. Carriage returns are normalised, blank
 * lines inside a description are kept as paragraph breaks, and a run of three or
 * more newlines is folded to one blank line.
 *
 * @param {Uint8Array|ArrayBuffer|null} bytes
 * @returns {{title: string, description: string}[]}
 */
export function parseDungeonTxt(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? 0);
  const text = new TextDecoder('latin1').decode(view);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  /** @type {{title: string, description: string}[]} */
  const entries = [];
  let title = '';
  /** @type {string[]} */
  let body = [];

  const flush = () => {
    if (!title) {
      body = [];
      return;
    }
    const description = body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    entries.push({ title: title.trim(), description });
    title = '';
    body = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '#') {
      flush();
      continue;
    }
    if (!title) {
      if (!line.trim()) continue;
      title = line.trim();
      continue;
    }
    body.push(line);
  }
  flush();
  return entries;
}

/**
 * A dungeon name as the file and the game spell it, for comparison.
 * `The Imperial Palace` and `Imperial Palace` are the same place.
 * @param {string} name
 * @returns {string}
 */
export function normaliseDungeonName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The file's own record for a dungeon, or null when it has none.
 *
 * @param {{title: string, description: string}[]} entries
 * @param {string} name
 * @returns {{title: string, description: string}|null}
 */
export function dungeonTxtFor(entries, name) {
  const wanted = normaliseDungeonName(name);
  if (!wanted) return null;
  return (entries ?? []).find((entry) => normaliseDungeonName(entry.title) === wanted) ?? null;
}

/** The names the file carries, in its own order — useful for a coverage check. */
export function dungeonTxtTitles(entries) {
  return (entries ?? []).map((entry) => entry.title);
}
