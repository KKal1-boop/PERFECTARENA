// THE LEVEL'S OWN TRIGGERS — `*TRIG` cells resolved against the level's `.INF`.
//
// A `.MIF` level carries a `TRIG` chunk, four bytes per entry: `x`, `y`, then two
// **signed** bytes — `textIndex` and `soundIndex` (measured, twice): every
// shipped dungeon's silent/textless cells read `255`, which is `-1` as a signed
// byte, and the ranges otherwise stay inside the level's own `@SOUND` slots and
// `*TEXT` ids. OpenTESArena's readers say the same (`MIFFile.cpp`/`ArenaTypes.h`).
//
// What each index resolves against (`infFile.js` parses both):
//
//   `textIndex`   a `*TEXT` id in the level's own `.INF`. The id space is *one*:
//                 lore, key descriptions and riddles share it, as the measured
//                 `halls1.inf` shows — lore `{0, 1, 8}`, keys `{2..7}`. `0xA8`
//                 (`~`-prefixed) lore is the once-per-visit kind; the port shows
//                 every trigger's prose once per level visit, which is exactly
//                 what walk-onto cells want either way.
//   `soundIndex`  a `@SOUND` **slot number**, not a list position: the line says
//                 both, `"SPLASH.VOC 23"`, and the trigger names the second.
//
// Coordinates: a trigger's `x` is the cell **column** and `y` the **row** — the
// same order the `LOCK` chunk was measured in (`doors.js`: "x as the column").
// With the mesher's own mapping (`mifMesh.js`: `x0 = row * S`, `z0 = col * S`)
// the trigger cell is where world `x = y·S`, `z = x·S`.

/**
 * A parsed `.TRIG` byte is signed: `255` is `-1` (silence / no text), `128+` is
 * `-128..-1`. Returns a number in `-128..127`.
 * @param {number} byte
 * @returns {number}
 */
export function signedByte(byte) {
  return byte >= 128 ? byte - 256 : byte;
}

/**
 * Build the level's trigger table, keyed `"row,col"` — the same key the door
 * index and the HUD's nearest-cell checks use. Only cells that actually mean
 * something are kept: a cell with `-1` text, `-1` sound and `-1` sound is not
 * a trigger any player could notice.
 *
 * @param {object} level a parsed `.MIF` level (`mifFile.js`), `trig` entries read
 * @returns {Map<string, {row:number, col:number, textIndex:number, soundIndex:number}>}
 */
export function triggerTable(level) {
  const table = new Map();
  for (const t of level?.trig ?? []) {
    const textIndex = signedByte(t.textIndex);
    const soundIndex = signedByte(t.soundIndex);
    if (textIndex < 0 && soundIndex < 0) continue;
    // `x` is the column, `y` the row (the measured `LOCK` order).
    table.set(`${t.y},${t.x}`, { row: t.y, col: t.x, textIndex, soundIndex });
  }
  return table;
}

/**
 * A trigger's prose, from the level's own text records.
 *
 * @param {import('../arena/infFile.js').InfFile} inf
 * @param {{textIndex:number}} trigger
 * @returns {{kind:'lore'|'key'|'riddle', text:string}|null} `null` when the id is
 *   `-1` or points outside the level's records (kept, shown to nobody)
 */
export function triggerText(inf, trigger) {
  const id = trigger.textIndex;
  if (id === null || id === undefined || id < 0 || !inf) return null;
  const lore = inf.loreTexts?.get(id);
  if (lore) {
    // A `~`-prefixed (`0xA8`) record starts with a `0x0A` new line in the shipped
    // data (the `~` was the once-only marker the parser kept prose after); prose
    // reads better without a leading blank line.
    return { kind: 'lore', text: lore.replace(/^\n+/, '').trim() };
  }
  const key = inf.keys?.get(id);
  if (key !== undefined) {
    return { kind: 'key', text: `This is a key of ward ${key} — the locks of its place bend to it.` };
  }
  const riddle = inf.riddles?.get(id);
  if (riddle) {
    return { kind: 'riddle', text: riddle.riddle.trim() };
  }
  return null;
}

/**
 * A trigger's sound filename, looked up by the **slot number** the `@SOUND` line
 * itself carries — `"SPLASH.VOC 23"` is the level's sound 23, and a trigger
 * naming 23 means exactly that file, wherever it sits in the list.
 *
 * @param {import('../arena/infFile.js').InfFile} inf
 * @param {{soundIndex:number}} trigger
 * @returns {string|null} upper-case filename, or `null` for `-1`/unknown slots
 */
export function triggerSound(inf, trigger) {
  const slot = trigger.soundIndex;
  if (slot === null || slot === undefined || slot < 0 || !inf?.sounds) return null;
  for (const s of inf.sounds) {
    if (s.index === slot) return s.file;
  }
  return null;
}

/**
 * What a walked-onto cell does: its prose (or none) and its sound (or none).
 *
 * @param {import('../arena/infFile.js').InfFile} inf
 * @param {{textIndex:number, soundIndex:number}} trigger
 * @returns {{text:{kind:'lore'|'key'|'riddle', text:string}|null, sound:string|null}}
 */
export function triggerEvent(inf, trigger) {
  return { text: triggerText(inf, trigger), sound: triggerSound(inf, trigger) };
}
